import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signToken, verifyToken } from '../src/lib/jwt.js';
import { decodeCursor, encodeCursor, toPage } from '../src/lib/pagination.js';
import { canView, isOwner } from '../src/lib/sharedContent.js';
import { createToken, hashToken } from '../src/lib/tokens.js';
import { shouldNotify } from '../src/modules/notifications/notifications.service.js';
import { spreadOverTiers } from '../src/modules/rankings/rankings.service.js';
import { hasRole, isModerator, roleOf } from '../src/lib/roles.js';

const ADA = '64b000000000000000000001';
const BOB = '64b000000000000000000002';

test('a signed token verifies back to the user id, and a tampered one is rejected', async () => {
  const token = await signToken(ADA);
  assert.equal(await verifyToken(token), ADA);
  await assert.rejects(verifyToken(`${token.slice(0, -2)}xx`));
  await assert.rejects(verifyToken('not-a-token'));
});

test('one-time tokens are random, URL-safe, and stored as a hash', () => {
  const first = createToken();
  const second = createToken();
  assert.notEqual(first.token, second.token);
  assert.match(first.token, /^[\w-]{43}$/);
  assert.equal(first.tokenHash, hashToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
});

test('cursors round-trip, and a broken one is a 400', () => {
  const position = { createdAt: '2026-11-15T00:00:00.000Z', _id: ADA };
  assert.deepEqual(decodeCursor(encodeCursor(position)), position);
  assert.equal(decodeCursor(undefined), null);
  assert.throws(() => decodeCursor('%%%'), { status: 400 });
});

test('toPage drops the extra document and only gives a cursor when more exist', () => {
  const docs = [{ _id: 1 }, { _id: 2 }, { _id: 3 }];
  const full = toPage(docs, 2, (doc) => ({ _id: doc._id }));
  assert.deepEqual(full.items, [{ _id: 1 }, { _id: 2 }]);
  assert.deepEqual(decodeCursor(full.nextCursor), { _id: 2 });

  const last = toPage(docs, 3, (doc) => ({ _id: doc._id }));
  assert.equal(last.items.length, 3);
  assert.equal(last.nextCursor, null);
});

test('private content is only visible to its owner; public and unlisted to anyone', () => {
  const content = (visibility) => ({ ownerId: ADA, visibility });
  assert.equal(canView(content('public'), null), true);
  assert.equal(canView(content('unlisted'), BOB), true);
  assert.equal(canView(content('private'), BOB), false);
  assert.equal(canView(content('private'), null), false);
  assert.equal(canView(content('private'), ADA), true);
  assert.equal(isOwner(content('public'), null), false);
});

test('the community ranking puts each item in the tier nearest its average, best first', () => {
  const labels = ['S', 'A', 'B', 'C', 'D', 'F'];
  const scores = [
    { _id: 'bottom', score: 1, votes: 2 },
    { _id: 'second', score: 0.2, votes: 2 },
    { _id: 'top', score: 0, votes: 2 },
    { _id: 'almost-top', score: 0.05, votes: 2 },
    { _id: 'between-a-and-c', score: 0.4, votes: 2 },
  ];

  const tiers = spreadOverTiers(scores, labels);
  assert.deepEqual(tiers.map((tier) => tier.label), labels);
  assert.deepEqual(tiers.map((tier) => tier.itemIds), [['top', 'almost-top'], ['second'], ['between-a-and-c'], [], [], ['bottom']]);
  assert.match(tiers[0].color, /^#[0-9a-f]{6}$/);

  // A template with a single tier takes everything
  assert.deepEqual(spreadOverTiers(scores, ['Only'])[0].itemIds.length, 5);
});

test('notifications respect the switches and never go to the person who acted', () => {
  const ada = { _id: ADA, notificationPrefs: { newComment: true, newRanking: true, newLike: false } };
  assert.equal(shouldNotify(ada, BOB, 'new_ranking'), true);
  assert.equal(shouldNotify(ada, BOB, 'new_comment'), true);
  assert.equal(shouldNotify(ada, BOB, 'new_like'), false);
  assert.equal(shouldNotify(ada, ADA, 'new_ranking'), false);
});

test('roles: each one includes the ones below it, and no role means user', () => {
  assert.equal(hasRole('admin', 'moderator'), true);
  assert.equal(hasRole('moderator', 'moderator'), true);
  assert.equal(hasRole('moderator', 'admin'), false);
  assert.equal(hasRole(undefined, 'moderator'), false);
  assert.equal(isModerator('user'), false);
  assert.equal(roleOf({}), 'user');
  assert.equal(roleOf({ role: 'admin' }), 'admin');
});
