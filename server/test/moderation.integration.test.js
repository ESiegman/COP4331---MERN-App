import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pushClient } from '../src/integrations/push.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { signToken } from '../src/lib/jwt.js';
import { Comment, Item, Like, ModerationLog, Notification, Ranking, Template, User } from '../src/models/index.js';

// Moderators, admins, bans and the moderation log against a real database prepared by
// db/setup.js. Skipped unless MONGODB_URI is set (see auth.integration.test.js).
// Ada owns a template, bob ranked it, eve commented on bob's ranking. mod and mod2 are
// moderators, boss is the admin.

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';

describe('moderation against a real database', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex');
  const users = {};
  const tokens = {};
  let template;
  let hiddenTemplate;
  let bobs;
  let evesComment;

  const api = (method, path, who, body) => {
    const req = request(app)[method](`/api${path}`);
    if (who) req.set(tokens[who]);
    return body ? req.send(body) : req;
  };
  const name = (who) => users[who].username;
  const ourLog = async () =>
    (await api('get', '/admin/log?limit=50', 'boss')).body.items.filter((entry) => entry.targetUser?.username.endsWith(run));

  before(async () => {
    await connectDb();
    const roles = { boss: 'admin', mod: 'moderator', mod2: 'moderator' };
    for (const who of ['boss', 'mod', 'mod2', 'ada', 'bob', 'eve']) {
      users[who] = await User.create({
        username: `${who}_${run}`,
        email: `${who}_${run}@example.com`,
        emailVerified: true,
        role: roles[who],
        ...(who === 'eve' && {
          passwordHash: await bcrypt.hash('eve password', 4),
          pushTokens: ['ExponentPushToken[eve]'],
          // Every switch off: a removal is still announced
          notificationPrefs: { newComment: false, newRanking: false, newLike: false },
        }),
      });
      tokens[who] = { Authorization: `Bearer ${await signToken(users[who]._id)}` };
    }

    template = await Template.create({ ownerId: users.ada._id, title: 'Snacks', rankingCount: 1 });
    hiddenTemplate = await Template.create({ ownerId: users.ada._id, title: 'Secret', visibility: 'private' });
    await Item.create({ templateId: template._id, name: 'Chips' });
    bobs = await Ranking.create({
      templateId: template._id,
      ownerId: users.bob._id,
      title: 'Road trip picks',
      tiers: [{ label: 'S', color: '#ff7f7f', order: 0, itemIds: [] }],
      publishedAt: new Date(),
      commentCount: 1,
    });
    evesComment = await Comment.create({ rankingId: bobs._id, authorId: users.eve._id, body: 'This list is garbage and so are you' });
  });

  after(async () => {
    const userIds = Object.values(users).map((user) => user._id);
    const templateIds = await Template.find({ ownerId: { $in: userIds } }).distinct('_id');
    const rankingIds = await Ranking.find({ $or: [{ ownerId: { $in: userIds } }, { templateId: { $in: templateIds } }] }).distinct('_id');
    await Comment.deleteMany({ rankingId: { $in: rankingIds } });
    await Like.deleteMany({ rankingId: { $in: rankingIds } });
    await Notification.deleteMany({ recipientId: { $in: userIds } });
    await Ranking.deleteMany({ _id: { $in: rankingIds } });
    await Item.deleteMany({ templateId: { $in: templateIds } });
    await Template.deleteMany({ _id: { $in: templateIds } });
    await ModerationLog.deleteMany({ $or: [{ targetUserId: { $in: userIds } }, { actorId: { $in: userIds } }] });
    await User.deleteMany({ _id: { $in: userIds } });
    await disconnectDb();
  });

  test('your account says what role you have', async () => {
    assert.equal((await api('get', '/users/me', 'mod')).body.role, 'moderator');
    assert.equal((await api('get', '/users/me', 'ada')).body.role, 'user');
  });

  test("only a moderator can delete someone else's content", async () => {
    const res = await api('delete', `/rankings/${bobs._id}`, 'ada');
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Only the owner can change this ranking');
    assert.equal((await api('delete', `/comments/${evesComment._id}`, 'ada')).status, 403);
  });

  test('a moderator removes a comment: the author is told why, but not by whom', async (t) => {
    const push = t.mock.method(pushClient, 'send', async () => []);
    const res = await api('delete', `/comments/${evesComment._id}`, 'mod', { reason: 'Personal attack' });
    assert.equal(res.status, 204);
    assert.equal(await Comment.exists({ _id: evesComment._id }), null);
    assert.equal((await Ranking.findById(bobs._id)).commentCount, 0);

    const [notice] = (await api('get', '/notifications', 'eve')).body.items;
    assert.equal(notice.type, 'content_removed');
    assert.deepEqual(notice.removed, { kind: 'comment', title: 'This list is garbage and so are you', reason: 'Personal attack' });
    assert.equal(notice.actor, null);
    assert.equal('actorId' in notice, false);
    assert.equal(notice.ranking.title, 'Road trip picks', 'links to the ranking the comment was on');

    const [tokens, message] = push.mock.calls[0].arguments;
    assert.deepEqual(tokens, ['ExponentPushToken[eve]']);
    assert.equal(message.body, 'A moderator removed your comment "This list is garbage and so are you"');
    assert.equal(message.data.rankingId, String(bobs._id));
  });

  test('a moderator removes a ranking and a template; private content stays out of reach', async () => {
    assert.equal((await api('delete', `/rankings/${bobs._id}`, 'mod')).status, 204);
    assert.equal((await Template.findById(template._id)).rankingCount, 0, 'the count is redone');
    const [bobsNotice] = (await api('get', '/notifications', 'bob')).body.items;
    assert.deepEqual(bobsNotice.removed, { kind: 'ranking', title: 'Road trip picks' });
    assert.equal(bobsNotice.ranking, null);

    assert.equal((await api('delete', `/templates/${hiddenTemplate._id}`, 'mod')).status, 404);

    const res = await api('delete', `/templates/${template._id}`, 'mod', { reason: 'Off-topic' });
    assert.equal(res.status, 204);
    assert.equal(await Item.exists({ templateId: template._id }), null);
    const [adasNotice] = (await api('get', '/notifications', 'ada')).body.items;
    assert.deepEqual(adasNotice.removed, { kind: 'template', title: 'Snacks', reason: 'Off-topic' });
  });

  test('a ban stops the account at once, everywhere, and takes its phones off push', async () => {
    const res = await api('post', `/admin/users/${name('eve')}/ban`, 'mod', { reason: 'Harassment' });
    assert.equal(res.status, 200);
    assert.equal(res.body.username, name('eve'));
    assert.equal(res.body.banReason, 'Harassment');
    assert.ok(res.body.bannedAt);
    assert.equal('email' in res.body, false);
    assert.deepEqual((await User.findById(users.eve._id)).pushTokens, []);

    const me = await api('get', '/users/me', 'eve');
    assert.equal(me.status, 403);
    assert.equal(me.body.code, 'ACCOUNT_BANNED');
    assert.equal(me.body.error, 'This account has been banned: Harassment');
    assert.equal((await api('get', '/templates', 'eve')).status, 200, 'browsing as a guest still works');

    const login = await api('post', '/auth/login', null, { email: users.eve.email, password: 'eve password' });
    assert.equal(login.status, 403);
    assert.equal(login.body.code, 'ACCOUNT_BANNED');

    const banned = await api('get', '/admin/users?status=banned', 'mod');
    assert.ok(banned.body.items.some((user) => user.username === name('eve') && user.banReason === 'Harassment'));
  });

  test('who can ban whom', async () => {
    const ban = (by, who) => api('post', `/admin/users/${name(who)}/ban`, by, { reason: 'Test' });
    assert.equal((await ban('mod', 'mod2')).body.error, 'Only admins can ban moderators');
    assert.equal((await ban('mod', 'boss')).body.error, "Admins can't be banned. Change their role first.");
    assert.equal((await ban('mod', 'mod')).status, 400);
    assert.equal((await ban('ada', 'bob')).status, 403);
  });

  test('a banned account cannot be promoted, and unbanning lets it back in', async () => {
    const promote = await api('put', `/admin/users/${name('eve')}/role`, 'boss', { role: 'moderator' });
    assert.equal(promote.status, 409);
    assert.equal(promote.body.error, 'Unban them first');

    const res = await api('delete', `/admin/users/${name('eve')}/ban`, 'mod');
    assert.equal(res.status, 200);
    assert.equal('bannedAt' in res.body, false);
    assert.equal((await api('get', '/users/me', 'eve')).status, 200, 'the same token works again');
    assert.equal((await api('delete', `/admin/users/${name('eve')}/ban`, 'mod')).status, 200, 'unbanning twice is harmless');
  });

  test('an admin gives and takes roles, which apply on the very next request', async () => {
    assert.equal((await api('get', '/admin/users?status=staff', 'bob')).status, 403);

    const res = await api('put', `/admin/users/${name('bob')}/role`, 'boss', { role: 'moderator' });
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'moderator');

    const staff = await api('get', '/admin/users?status=staff', 'bob');
    assert.equal(staff.status, 200, "bob's old token now carries the new role");
    const ours = staff.body.items.map((user) => user.username).filter((username) => username.endsWith(run));
    assert.deepEqual(ours.sort(), [name('bob'), name('boss'), name('mod'), name('mod2')].sort());

    assert.equal((await api('put', `/admin/users/${name('boss')}/role`, 'boss', { role: 'user' })).status, 400);
    assert.equal((await api('put', `/admin/users/${name('bob')}/role`, 'boss', { role: 'user' })).body.role, 'user');
  });

  test('the log has every action, newest first, with who did it to whom', async () => {
    const log = await ourLog();
    assert.deepEqual(
      log.map((entry) => entry.action),
      ['set_role', 'set_role', 'unban', 'ban', 'delete_template', 'delete_ranking', 'delete_comment'],
      'a refused action and the second unban are not logged',
    );
    const comment = log.at(-1);
    assert.equal(comment.actor.username, name('mod'));
    assert.equal(comment.targetUser.username, name('eve'));
    assert.equal(comment.summary, 'This list is garbage and so are you');
    assert.equal(comment.reason, 'Personal attack');
    assert.equal(comment.contentId, String(evesComment._id));
    assert.equal(log[1].summary, `${name('bob')}: user to moderator`);

    assert.equal((await api('get', '/admin/log', 'mod')).status, 403, 'moderators cannot read the log');
  });

  test('the setRole command on the server makes admins without a route, and is logged', () => {
    const setRole = (...args) =>
      spawnSync(process.execPath, ['src/scripts/setRole.js', ...args], { env: process.env, encoding: 'utf8' });

    const done = setRole(name('ada').toUpperCase(), 'admin');
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, new RegExp(`${name('ada')} is now admin`));
    assert.match(setRole(name('ada'), 'admin').stdout, /is already admin/);

    const wrong = setRole(name('ada'), 'superuser');
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /Usage/);
    assert.equal(setRole(`nobody_${run}`, 'admin').status, 1);
  });

  test('the command leaves a log entry with no actor', async () => {
    const [latest] = await ourLog();
    assert.equal(latest.action, 'set_role');
    assert.equal(latest.actor, null);
    assert.equal(latest.summary, `${name('ada')}: user to admin`);
    assert.equal(latest.reason, 'Set with the setRole command on the server');
  });
});
