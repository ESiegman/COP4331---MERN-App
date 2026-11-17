import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pushClient, pushOutbox } from '../src/integrations/push.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { signToken } from '../src/lib/jwt.js';
import { Comment, Item, Like, Notification, Ranking, Template, User } from '../src/models/index.js';

// A ranking is never more visible than its template, and Template.rankingCount matches what
// the template's page lists. Runs against a real database prepared by db/setup.js.
// Skipped unless MONGODB_URI is set (see auth.integration.test.js).

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';

describe('ranking visibility follows the template, and rankingCount stays right', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex'); // random, because test files run at the same time
  const users = {};
  const tokens = {};

  const api = (method, path, who, body) => {
    const req = request(app)[method](`/api${path}`);
    if (who) req.set(tokens[who]);
    return body ? req.send(body) : req;
  };
  const tiersFor = (template) => [{ label: 'S', color: '#ff7f7f', itemIds: [template.items[0]._id] }];
  const makeTemplate = async (who, visibility) =>
    (await api('post', '/templates', who, { title: `Vis ${run}`, visibility, items: [{ name: 'One' }, { name: 'Two' }] })).body;
  const publish = async (who, template, visibility = 'public') => {
    const ranking = (await api('post', `/templates/${template.template._id}/rankings`, who)).body;
    const res = await api('put', `/rankings/${ranking._id}`, who, { visibility, publish: true, tiers: tiersFor(template) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return ranking._id;
  };
  const rankingCount = async (template) => (await Template.findById(template.template._id)).rankingCount;
  const feedIds = async () => (await api('get', '/rankings?limit=50')).body.items.map((r) => r._id);

  before(async () => {
    await connectDb();
    for (const name of ['ada', 'bob', 'eve']) {
      users[name] = await User.create({ username: `${name}_v${run}`, email: `${name}_v${run}@example.com`, emailVerified: true });
      tokens[name] = { Authorization: `Bearer ${await signToken(users[name]._id)}` };
    }
  });

  after(async () => {
    const userIds = Object.values(users).map((user) => user._id);
    const templateIds = await Template.find({ ownerId: { $in: userIds } }).distinct('_id');
    const rankingIds = await Ranking.find({ $or: [{ ownerId: { $in: userIds } }, { templateId: { $in: templateIds } }] }).distinct('_id');
    await Comment.deleteMany({ rankingId: { $in: rankingIds } });
    await Like.deleteMany({ rankingId: { $in: rankingIds } });
    await Notification.deleteMany({ $or: [{ rankingId: { $in: rankingIds } }, { recipientId: { $in: userIds } }] });
    await Ranking.deleteMany({ _id: { $in: rankingIds } });
    await Item.deleteMany({ templateId: { $in: templateIds } });
    await Template.deleteMany({ _id: { $in: templateIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    await disconnectDb();
  });

  test('a public ranking of a private template stays private', async () => {
    const secret = await makeTemplate('ada', 'private');
    const id = await publish('ada', secret);

    assert.equal((await api('get', `/rankings/${id}`)).status, 404);
    assert.equal((await api('get', `/rankings/${id}`, 'bob')).status, 404);
    assert.equal((await api('get', `/rankings/${id}`, 'ada')).status, 200);
    assert.equal((await feedIds()).includes(id), false);

    const asGuest = (await api('get', `/users/${users.ada.username}/rankings`)).body.items.map((r) => r._id);
    const asOwner = (await api('get', `/users/${users.ada.username}/rankings`, 'ada')).body.items.map((r) => r._id);
    assert.equal(asGuest.includes(id), false);
    assert.equal(asOwner.includes(id), true);

    assert.deepEqual((await api('get', `/templates/${secret.template._id}/rankings`, 'ada')).body.items, []);
    assert.equal((await api('get', `/templates/${secret.template._id}/community-ranking`, 'ada')).body.rankingCount, 0);
    assert.equal(await rankingCount(secret), 0);
  });

  test('making a template private hides the rankings other people already published', async () => {
    const snacks = await makeTemplate('ada', 'public');
    const id = await publish('bob', snacks);
    assert.equal((await feedIds()).includes(id), true);
    assert.equal(await rankingCount(snacks), 1);

    const hide = await api('patch', `/templates/${snacks.template._id}`, 'ada', { visibility: 'private' });
    assert.equal(hide.body.rankingCount, 0);

    assert.equal((await api('get', `/rankings/${id}`)).status, 404);
    assert.equal((await api('get', `/rankings/${id}`, 'eve')).status, 404);
    assert.equal((await api('get', `/rankings/${id}`, 'bob')).status, 200, 'the owner keeps their own ranking');
    assert.equal((await feedIds()).includes(id), false);
    assert.equal((await api('put', `/rankings/${id}/like`, 'eve')).status, 404);
    assert.equal((await api('post', `/rankings/${id}/comments`, 'eve', { body: 'hi' })).status, 404);

    const show = await api('patch', `/templates/${snacks.template._id}`, 'ada', { visibility: 'public' });
    assert.equal(show.body.rankingCount, 1);
    assert.equal((await api('get', `/rankings/${id}`)).status, 200);
    assert.equal((await feedIds()).includes(id), true);
  });

  test('a public ranking of an unlisted template opens by link but is never listed', async () => {
    const study = await makeTemplate('ada', 'unlisted');
    const id = await publish('bob', study);

    assert.equal((await api('get', `/rankings/${id}`)).status, 200);
    assert.equal((await feedIds()).includes(id), false);
    const bobsList = (await api('get', `/users/${users.bob.username}/rankings`)).body.items.map((r) => r._id);
    assert.equal(bobsList.includes(id), false);
    // Whoever has the template's link sees its rankings there
    assert.deepEqual((await api('get', `/templates/${study.template._id}/rankings`)).body.items.map((r) => r._id), [id]);
    assert.equal(await rankingCount(study), 1);
  });

  test('rankingCount only counts public published rankings, through every change', async () => {
    const fries = await makeTemplate('ada', 'public');
    const id = await publish('bob', fries, 'unlisted');
    assert.equal(await rankingCount(fries), 0, 'unlisted ranking');

    const save = (visibility) => api('put', `/rankings/${id}`, 'bob', { visibility, tiers: tiersFor(fries) });
    await save('public');
    assert.equal(await rankingCount(fries), 1, 'switched to public');
    await save('private');
    assert.equal(await rankingCount(fries), 0, 'switched to private');
    await save('public');

    const draft = (await api('post', `/templates/${fries.template._id}/rankings`, 'eve')).body;
    await api('put', `/rankings/${draft._id}`, 'eve', { visibility: 'public', tiers: tiersFor(fries) });
    assert.equal(await rankingCount(fries), 1, 'drafts are not counted');

    assert.equal((await api('delete', `/rankings/${id}`, 'bob')).status, 204);
    assert.equal(await rankingCount(fries), 0, 'deleted');

    const listed = (await api('get', `/templates/${fries.template._id}/rankings`)).body.items.length;
    assert.equal(await rankingCount(fries), listed);
  });

  test('the template owner’s phone gets a push when someone publishes a ranking', async () => {
    await User.updateOne({ _id: users.ada._id }, { pushTokens: ['ExponentPushToken[ada-phone]'] });
    const drinks = await makeTemplate('ada', 'public');
    const id = await publish('bob', drinks);

    const sent = pushOutbox.find((push) => push.data.rankingId === id);
    assert.deepEqual(sent.to, ['ExponentPushToken[ada-phone]']);
    assert.equal(sent.body, `${users.bob.username} ranked your Vis ${run} list`);
    const notification = await Notification.findOne({ rankingId: id });
    assert.equal(sent.data.notificationId, String(notification._id));
  });

  test('a phone Expo says is gone is dropped from the account', async (t) => {
    await User.updateOne({ _id: users.ada._id }, { pushTokens: ['ExponentPushToken[old-phone]', 'ExponentPushToken[new-phone]'] });
    t.mock.method(pushClient, 'send', async () => ['ExponentPushToken[old-phone]']);

    await publish('eve', await makeTemplate('ada', 'public'));
    assert.deepEqual([...(await User.findById(users.ada._id)).pushTokens], ['ExponentPushToken[new-phone]']);
  });

  test('a push that fails does not fail the request', async (t) => {
    t.mock.method(pushClient, 'send', async () => {
      throw new Error('Expo is down');
    });
    const id = await publish('eve', await makeTemplate('ada', 'public'));
    assert.equal((await api('get', `/rankings/${id}`)).status, 200);
  });

  test('publishing a ranking of a template that went private notifies nobody', async () => {
    const pizza = await makeTemplate('ada', 'public');
    const draft = (await api('post', `/templates/${pizza.template._id}/rankings`, 'bob')).body;
    await api('patch', `/templates/${pizza.template._id}`, 'ada', { visibility: 'private' });

    const before = await Notification.countDocuments({ recipientId: users.ada._id });
    const res = await api('put', `/rankings/${draft._id}`, 'bob', { visibility: 'public', publish: true, tiers: tiersFor(pizza) });
    assert.equal(res.status, 200);
    assert.equal(await Notification.countDocuments({ recipientId: users.ada._id }), before);
  });
});
