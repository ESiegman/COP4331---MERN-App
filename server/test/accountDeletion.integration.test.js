import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { signToken } from '../src/lib/jwt.js';
import {
  AuthToken, Comment, Item, Like, ModerationLog, Notification, OAuthAccount, Ranking, Template, User,
} from '../src/models/index.js';

// DELETE /users/me against a real database prepared by db/setup.js. Skipped unless
// MONGODB_URI is set (see auth.integration.test.js).
// Ada is the account being deleted. She owns a template that bob ranked, she ranked bob's
// template, and she commented on and liked carl's ranking of it. Dee signs in with Discord only.

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';
const PASSWORD = 'ada password';

describe('deleting your own account against a real database', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex');
  const users = {};
  const tokens = {};
  const tiers = [{ label: 'S', color: '#ff7f7f', order: 0, itemIds: [] }];
  let adasTemplate;
  let bobsTemplate;
  let bobsRankingOfAdas;
  let adasRankingOfBobs;
  let carls;
  let bobsComment;

  const api = (method, path, who, body) => {
    const req = request(app)[method](`/api${path}`);
    if (who) req.set(tokens[who]);
    return body ? req.send(body) : req;
  };

  before(async () => {
    await connectDb();
    for (const who of ['ada', 'bob', 'carl', 'dee']) {
      users[who] = await User.create({
        username: `${who}_${run}`,
        email: `${who}_${run}@example.com`,
        emailVerified: true,
        ...(who === 'ada' && { passwordHash: await bcrypt.hash(PASSWORD, 4) }),
      });
      tokens[who] = { Authorization: `Bearer ${await signToken(users[who]._id)}` };
    }
    const { ada, bob, carl, dee } = users;
    const published = { tiers, publishedAt: new Date() };

    adasTemplate = await Template.create({ ownerId: ada._id, title: 'Snacks', rankingCount: 1 });
    await Item.create({ templateId: adasTemplate._id, name: 'Chips' });
    bobsRankingOfAdas = await Ranking.create({ templateId: adasTemplate._id, ownerId: bob._id, ...published });
    await Comment.create({ rankingId: bobsRankingOfAdas._id, authorId: carl._id, body: 'Nice' });

    bobsTemplate = await Template.create({ ownerId: bob._id, title: 'Board games', rankingCount: 2 });
    adasRankingOfBobs = await Ranking.create({ templateId: bobsTemplate._id, ownerId: ada._id, ...published });
    carls = await Ranking.create({ templateId: bobsTemplate._id, ownerId: carl._id, ...published, commentCount: 3, likeCount: 2 });
    await Comment.create({ rankingId: carls._id, authorId: ada._id, body: 'Catan in C?' });
    await Comment.create({ rankingId: carls._id, authorId: ada._id, body: 'Really?' });
    bobsComment = await Comment.create({ rankingId: carls._id, authorId: bob._id, body: 'Agreed' });
    await Like.create({ rankingId: carls._id, userId: ada._id });
    await Like.create({ rankingId: carls._id, userId: bob._id });

    await Notification.create([
      { recipientId: carl._id, actorId: ada._id, type: 'new_comment', rankingId: carls._id },
      { recipientId: carl._id, actorId: ada._id, type: 'new_like', rankingId: carls._id },
      { recipientId: carl._id, actorId: bob._id, type: 'new_comment', rankingId: carls._id },
      { recipientId: ada._id, actorId: bob._id, type: 'new_ranking', rankingId: bobsRankingOfAdas._id },
      // Ada removed something of carl's as a moderator once
      { recipientId: carl._id, actorId: ada._id, type: 'content_removed', removed: { kind: 'comment', title: 'Old', reason: 'Spam' } },
    ]);
    await AuthToken.create({ userId: ada._id, type: 'reset_password', tokenHash: 'x', expiresAt: new Date(Date.now() + 3600e3) });
    await OAuthAccount.create({ userId: ada._id, provider: 'google', providerUserId: `g_${run}` });
    await OAuthAccount.create({ userId: dee._id, provider: 'discord', providerUserId: `d_${run}` });
    await ModerationLog.create({ action: 'ban', targetUserId: ada._id, summary: `${ada.username}`, reason: 'Test' });
  });

  after(async () => {
    const userIds = Object.values(users).map((user) => user._id);
    const templateIds = [adasTemplate._id, bobsTemplate._id];
    const rankingIds = await Ranking.find({ templateId: { $in: templateIds } }).distinct('_id');
    await Comment.deleteMany({ rankingId: { $in: rankingIds } });
    await Like.deleteMany({ rankingId: { $in: rankingIds } });
    await Notification.deleteMany({ recipientId: { $in: userIds } });
    await Ranking.deleteMany({ _id: { $in: rankingIds } });
    await Item.deleteMany({ templateId: { $in: templateIds } });
    await Template.deleteMany({ _id: { $in: templateIds } });
    await AuthToken.deleteMany({ userId: { $in: userIds } });
    await OAuthAccount.deleteMany({ userId: { $in: userIds } });
    await ModerationLog.deleteMany({ targetUserId: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    await disconnectDb();
  });

  test('an account with a password needs it', async () => {
    const missing = await api('delete', '/users/me', 'ada');
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, 'Enter your password to delete this account');

    const wrong = await api('delete', '/users/me', 'ada', { password: 'not it' });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.code, 'WRONG_PASSWORD');
    assert.ok(await User.exists({ _id: users.ada._id }));
  });

  test('the only admin cannot leave the site without one', async (t) => {
    await User.updateOne({ _id: users.ada._id }, { role: 'admin' });
    t.mock.method(User, 'exists', async () => null); // as if no other admin existed
    const res = await api('delete', '/users/me', 'ada', { password: PASSWORD });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'You are the only admin. Make someone else admin first.');
    await User.updateOne({ _id: users.ada._id }, { role: 'user' });
  });

  test('deleting takes the account and everything it made, and fixes the counts it touched', async () => {
    const res = await api('delete', '/users/me', 'ada', { password: PASSWORD });
    assert.equal(res.status, 204);

    const me = await api('get', '/users/me', 'ada');
    assert.equal(me.status, 401);
    assert.equal(me.body.error, 'This account no longer exists');
    assert.equal((await api('get', `/users/${users.ada.username}`)).status, 404);

    // Her template goes with its items and every ranking of it, bob's included
    assert.equal(await Template.exists({ _id: adasTemplate._id }), null);
    assert.equal(await Item.exists({ templateId: adasTemplate._id }), null);
    assert.equal(await Ranking.exists({ _id: bobsRankingOfAdas._id }), null);
    assert.equal(await Comment.exists({ rankingId: bobsRankingOfAdas._id }), null);

    // Her ranking of bob's template goes, and the template's count drops
    assert.equal(await Ranking.exists({ _id: adasRankingOfBobs._id }), null);
    assert.equal((await Template.findById(bobsTemplate._id)).rankingCount, 1);

    // Carl's ranking stays, without her comments and like
    const carlsNow = await Ranking.findById(carls._id);
    assert.equal(carlsNow.commentCount, 1);
    assert.equal(carlsNow.likeCount, 1);
    assert.deepEqual((await Comment.find({ rankingId: carls._id })).map((c) => String(c._id)), [String(bobsComment._id)]);
    assert.equal(await Like.exists({ userId: users.ada._id }), null);
    assert.equal(String(carlsNow.updatedAt), String(carls.updatedAt), 'counter changes are not edits');

    // Carl keeps bob's notification and the removal notice, and loses hers
    const carlsNotifications = await Notification.find({ recipientId: users.carl._id }).lean();
    assert.deepEqual(carlsNotifications.map((n) => n.type).sort(), ['content_removed', 'new_comment']);
    assert.equal(await Notification.exists({ recipientId: users.ada._id }), null);

    assert.equal(await AuthToken.exists({ userId: users.ada._id }), null);
    assert.equal(await OAuthAccount.exists({ userId: users.ada._id }), null);
    assert.ok(await ModerationLog.exists({ targetUserId: users.ada._id }), 'the moderation log keeps its record');
  });

  test('a Google or Discord account deletes with no password, and its email can sign up again', async () => {
    assert.equal((await api('delete', '/users/me', 'dee')).status, 204);
    assert.equal(await OAuthAccount.exists({ userId: users.dee._id }), null);

    const again = await api('post', '/auth/register', null, {
      username: users.dee.username, email: users.dee.email, password: 'a fresh password',
    });
    assert.equal(again.status, 201);
    users.dee = await User.findOne({ email: users.dee.email });
  });
});
