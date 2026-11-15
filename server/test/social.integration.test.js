import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { signToken } from '../src/lib/jwt.js';
import { Comment, Item, Like, Notification, Ranking, Template, User } from '../src/models/index.js';

// Profiles, push tokens, comments and the notification list against a real database
// prepared by db/setup.js. Skipped unless MONGODB_URI is set (see auth.integration.test.js).
// Ada owns a template, bob has a published ranking of it, eve comments.

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';

describe('profiles, push tokens, comments and notifications against a real database', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex'); // random, because test files run at the same time
  const users = {};
  const tokens = {};
  let template;
  let hiddenTemplate;
  let bobs;
  let bobsDraft;
  let adasDraft;
  let evesComment;
  let adasComment;

  const api = (method, path, who, body) => {
    const req = request(app)[method](`/api${path}`);
    if (who) req.set(tokens[who]);
    return body ? req.send(body) : req;
  };
  const ids = (docs) => docs.map((doc) => String(doc._id));
  const tiers = [{ label: 'S', color: '#ff7f7f', order: 0, itemIds: [] }];

  before(async () => {
    await connectDb();
    for (const name of ['ada', 'bob', 'eve']) {
      users[name] = await User.create({
        username: `${name}_${run}`,
        email: `${name}_${run}@example.com`,
        emailVerified: true,
        displayName: name === 'eve' ? 'Eve' : undefined,
      });
      tokens[name] = { Authorization: `Bearer ${await signToken(users[name]._id)}` };
    }

    template = await Template.create({ ownerId: users.ada._id, title: 'Snacks', rankingCount: 1 });
    hiddenTemplate = await Template.create({ ownerId: users.ada._id, title: 'Secret', visibility: 'private' });
    await Item.create({ templateId: template._id, name: 'Chips' });

    bobs = await Ranking.create({ templateId: template._id, ownerId: users.bob._id, title: 'Road trip picks', tiers, publishedAt: new Date() });
    bobsDraft = await Ranking.create({ templateId: hiddenTemplate._id, ownerId: users.bob._id, tiers });
    adasDraft = await Ranking.create({ templateId: template._id, ownerId: users.ada._id, tiers });
  });

  after(async () => {
    const userIds = Object.values(users).map((user) => user._id);
    const templateIds = await Template.find({ ownerId: { $in: userIds } }).distinct('_id');
    const rankingIds = await Ranking.find({
      $or: [{ ownerId: { $in: userIds } }, { templateId: { $in: templateIds } }],
    }).distinct('_id');

    await Comment.deleteMany({ rankingId: { $in: rankingIds } });
    await Like.deleteMany({ rankingId: { $in: rankingIds } });
    await Notification.deleteMany({ $or: [{ rankingId: { $in: rankingIds } }, { recipientId: { $in: userIds } }] });
    await Ranking.deleteMany({ _id: { $in: rankingIds } });
    await Item.deleteMany({ templateId: { $in: templateIds } });
    await Template.deleteMany({ _id: { $in: templateIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    await disconnectDb();
  });

  test('a public profile shows no private fields, whatever the case of the username', async () => {
    const res = await api('get', `/users/${users.eve.username.toUpperCase()}`);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['_id', 'createdAt', 'displayName', 'username']);
    assert.equal(res.body.displayName, 'Eve');

    assert.equal((await api('get', `/users/nobody_${run}`)).status, 404);
  });

  test("a user's templates: everyone sees the public ones, the owner sees all", async () => {
    const path = `/users/${users.ada.username}/templates`;

    const asGuest = await api('get', path);
    assert.deepEqual(ids(asGuest.body.items), [String(template._id)]);
    assert.equal(asGuest.body.items[0].owner.username, users.ada.username);
    assert.deepEqual(ids((await api('get', path, 'bob')).body.items), [String(template._id)]);

    const asOwner = await api('get', `${path}?limit=1`, 'ada');
    assert.deepEqual(ids(asOwner.body.items), [String(hiddenTemplate._id)]);
    const next = await api('get', `${path}?limit=1&cursor=${asOwner.body.nextCursor}`, 'ada');
    assert.deepEqual(ids(next.body.items), [String(template._id)]);
    assert.equal(next.body.nextCursor, null);

    assert.equal((await api('get', `/users/nobody_${run}/templates`)).status, 404);
  });

  test("a user's rankings: drafts are only listed for their owner", async () => {
    const path = `/users/${users.bob.username}/rankings`;

    const asGuest = await api('get', path);
    assert.deepEqual(ids(asGuest.body.items), [String(bobs._id)]);
    assert.equal(asGuest.body.items[0].template.title, 'Snacks');
    assert.equal(asGuest.body.items[0].owner.username, users.bob.username);

    const asOwner = await api('get', path, 'bob');
    assert.deepEqual(ids(asOwner.body.items), [String(bobsDraft._id), String(bobs._id)]);
  });

  test('a push token belongs to one account at a time', async () => {
    const token = `ExponentPushToken[${run}]`;
    const pushTokens = async (name) => [...(await User.findById(users[name]._id)).pushTokens];

    assert.equal((await api('post', '/users/me/push-tokens', 'bob', { token })).status, 204);
    assert.equal((await api('post', '/users/me/push-tokens', 'bob', { token })).status, 204);
    assert.deepEqual(await pushTokens('bob'), [token]);

    // Eve logs in on the same phone: it stops being bob's
    assert.equal((await api('post', '/users/me/push-tokens', 'eve', { token })).status, 204);
    assert.deepEqual(await pushTokens('bob'), []);
    assert.deepEqual(await pushTokens('eve'), [token]);

    assert.equal((await api('delete', '/users/me/push-tokens', 'eve', { token })).status, 204);
    assert.deepEqual(await pushTokens('eve'), []);

    assert.equal((await api('post', '/users/me/push-tokens', 'eve', { token: 'not-a-token' })).status, 400);
  });

  test('commenting saves the comment, counts it and notifies the ranking owner', async () => {
    const before = await Ranking.findById(bobs._id);

    const res = await api('post', `/rankings/${bobs._id}/comments`, 'eve', { body: '  Chips in S tier, bold.  ' });
    assert.equal(res.status, 201);
    evesComment = res.body;
    assert.equal(evesComment.body, 'Chips in S tier, bold.');
    assert.equal(evesComment.author.username, users.eve.username);

    adasComment = (await api('post', `/rankings/${bobs._id}/comments`, 'ada', { body: 'Agreed' })).body;
    // Commenting on your own ranking notifies nobody
    assert.equal((await api('post', `/rankings/${bobs._id}/comments`, 'bob', { body: 'Thanks both' })).status, 201);

    const after = await Ranking.findById(bobs._id);
    assert.equal(after.commentCount, 3);
    assert.deepEqual(after.updatedAt, before.updatedAt);

    const notifications = await Notification.find({ recipientId: users.bob._id }).sort({ _id: 1 }).lean();
    assert.deepEqual(notifications.map((entry) => entry.type), ['new_comment', 'new_comment']);
    assert.deepEqual(notifications.map((entry) => String(entry.actorId)), [String(users.eve._id), String(users.ada._id)]);
  });

  test('drafts cannot be commented on, even by people who could see them', async () => {
    assert.equal((await api('post', `/rankings/${adasDraft._id}/comments`, 'eve', { body: 'hi' })).status, 404);
    assert.equal((await api('post', `/rankings/${adasDraft._id}/comments`, 'ada', { body: 'hi' })).status, 400);
    assert.equal((await api('get', `/rankings/${adasDraft._id}/comments`)).status, 404);
  });

  test('comments list oldest first with their authors, a page at a time', async () => {
    const first = await api('get', `/rankings/${bobs._id}/comments?limit=2`);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.items.map((comment) => comment.body), ['Chips in S tier, bold.', 'Agreed']);
    assert.deepEqual(first.body.items.map((comment) => comment.author.username), [users.eve.username, users.ada.username]);

    const rest = await api('get', `/rankings/${bobs._id}/comments?limit=2&cursor=${first.body.nextCursor}`);
    assert.deepEqual(rest.body.items.map((comment) => comment.body), ['Thanks both']);
    assert.equal(rest.body.nextCursor, null);
  });

  test('only the author can edit a comment', async () => {
    assert.equal((await api('patch', `/comments/${evesComment._id}`, 'bob', { body: 'Hijacked' })).status, 403);

    const edited = await api('patch', `/comments/${evesComment._id}`, 'eve', { body: 'Chips in A tier, on reflection.' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.body, 'Chips in A tier, on reflection.');
    assert.equal(edited.body.author.username, users.eve.username);

    assert.equal((await api('patch', `/comments/${bobs._id}`, 'eve', { body: 'x' })).status, 404);
  });

  test('a comment can be deleted by its author or the ranking owner, and the count follows', async () => {
    // Ada wrote neither eve's comment nor the ranking
    assert.equal((await api('delete', `/comments/${evesComment._id}`, 'ada')).status, 403);

    assert.equal((await api('delete', `/comments/${evesComment._id}`, 'bob')).status, 204);
    assert.equal((await api('delete', `/comments/${evesComment._id}`, 'bob')).status, 404);
    assert.equal((await api('delete', `/comments/${adasComment._id}`, 'ada')).status, 204);

    assert.equal((await Ranking.findById(bobs._id)).commentCount, 1);
    assert.equal(await Comment.countDocuments({ rankingId: bobs._id }), 1);
  });

  test('the notification list says who did what, newest first', async () => {
    const res = await api('get', '/notifications', 'bob');
    assert.equal(res.status, 200);
    assert.equal(res.body.unreadCount, 2);
    assert.deepEqual(res.body.items.map((entry) => entry.actor.username), [users.ada.username, users.eve.username]);

    const [newest] = res.body.items;
    assert.equal(newest.type, 'new_comment');
    assert.equal(newest.read, false);
    assert.equal(newest.ranking._id, String(bobs._id));
    assert.equal(newest.ranking.title, 'Road trip picks');
    assert.equal(newest.ranking.template.title, 'Snacks');

    const page = await api('get', '/notifications?limit=1', 'bob');
    assert.equal(page.body.items.length, 1);
    const next = await api('get', `/notifications?limit=1&cursor=${page.body.nextCursor}`, 'bob');
    assert.equal(next.body.items[0].actor.username, users.eve.username);
    assert.equal(next.body.nextCursor, null);

    // Nobody else's notifications show up
    assert.deepEqual((await api('get', '/notifications', 'eve')).body, { items: [], nextCursor: null, unreadCount: 0 });
  });

  test('marking read only works on your own notifications', async () => {
    const [newest, oldest] = (await api('get', '/notifications', 'bob')).body.items;

    assert.equal((await api('patch', `/notifications/${newest._id}`, 'eve', { read: true })).status, 404);
    assert.equal((await api('patch', `/notifications/${newest._id}`, 'bob', { read: false })).status, 400);
    assert.equal((await api('patch', `/notifications/${newest._id}`, 'bob', { read: true })).status, 204);

    const unread = await api('get', '/notifications?unread=true', 'bob');
    assert.equal(unread.body.unreadCount, 1);
    assert.deepEqual(ids(unread.body.items), [oldest._id]);

    assert.equal((await api('post', '/notifications/read-all', 'bob')).status, 204);
    const all = await api('get', '/notifications', 'bob');
    assert.equal(all.body.unreadCount, 0);
    assert.deepEqual(all.body.items.map((entry) => entry.read), [true, true]);
  });
});
