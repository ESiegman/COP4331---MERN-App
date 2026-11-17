import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { signToken } from '../src/lib/jwt.js';
import { Comment, Item, Like, Notification, Ranking, Template, User } from '../src/models/index.js';

// Templates, items, rankings and likes against a real database prepared by db/setup.js.
// Skipped unless MONGODB_URI is set (see auth.integration.test.js).
// The tests run in order and build on each other: ada makes a template, bob ranks it, eve looks on.

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';

describe('templates and rankings against a real database', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex'); // random, because test files run at the same time
  const word = `zq${run}`; // a word only this run uses, so searches find just these templates
  const users = {};
  const tokens = {};
  let template;
  let privateTemplate;
  let otherTemplate;
  let chips;
  let jerky;
  let gum;
  let bobs;
  let adas;

  const api = (method, path, who, body) => {
    const req = request(app)[method](`/api${path}`);
    if (who) req.set(tokens[who]);
    return body ? req.send(body) : req;
  };
  const ids = (docs) => docs.map((doc) => String(doc._id));
  const tier = (label, color, ...items) => ({ label, color, itemIds: ids(items) });
  const board = (s, a, c, f) => [
    tier('S', '#ff7f7f', ...s),
    tier('A', '#ffbf7f', ...a),
    tier('B', '#ffdf7f'),
    tier('C', '#ffff7f', ...c),
    tier('D', '#bfff7f'),
    tier('F', '#7fbfff', ...f),
  ];

  before(async () => {
    await connectDb();
    for (const name of ['ada', 'bob', 'eve']) {
      users[name] = await User.create({ username: `${name}_${run}`, email: `${name}_${run}@example.com`, emailVerified: true });
      tokens[name] = { Authorization: `Bearer ${await signToken(users[name]._id)}` };
    }
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

  test('creating a template saves it with its items', async () => {
    const res = await api('post', '/templates', 'ada', {
      title: `Snacks ${word}`,
      category: 'Food',
      items: [{ name: 'Chips' }, { name: 'Jerky' }, { name: 'Gum' }],
    });
    assert.equal(res.status, 201);
    ({ template } = res.body);
    [chips, jerky, gum] = res.body.items;

    assert.deepEqual(template.tierLabels, ['S', 'A', 'B', 'C', 'D', 'F']);
    assert.equal(template.category, 'food');
    assert.equal(template.rankingCount, 0);
    assert.deepEqual(res.body.items.map((item) => item.name), ['Chips', 'Jerky', 'Gum']);
    assert.equal(res.body.owner.username, users.ada.username);
    assert.ok(res.body.shareUrl.endsWith(`/templates/${template._id}`));
  });

  test('if the items cannot be saved, the template is not saved either', async (t) => {
    t.mock.method(Item, 'insertMany', async () => {
      throw new Error('simulated failure');
    });
    const res = await api('post', '/templates', 'ada', { title: `Broken ${word}`, items: [{ name: 'x' }] });
    assert.equal(res.status, 500);
    assert.equal(await Template.exists({ title: `Broken ${word}` }), null);
  });

  test('private templates are hidden, unlisted ones open by link only', async () => {
    const hidden = await api('post', '/templates', 'ada', { title: `Private ${word}`, visibility: 'private' });
    const unlisted = await api('post', '/templates', 'ada', { title: `Unlisted ${word}`, visibility: 'unlisted' });
    privateTemplate = hidden.body.template;

    assert.equal((await api('get', `/templates/${privateTemplate._id}`)).status, 404);
    assert.equal((await api('get', `/templates/${privateTemplate._id}`, 'bob')).status, 404);
    assert.equal((await api('get', `/templates/${privateTemplate._id}`, 'ada')).status, 200);
    assert.equal((await api('get', `/templates/${unlisted.body.template._id}`)).status, 200);

    const list = await api('get', `/templates?q=${word}`);
    assert.equal(list.status, 200);
    assert.deepEqual(ids(list.body.items), [template._id]);
    assert.equal(list.body.items[0].owner.username, users.ada.username);
  });

  test('the list searches, filters by category and pages newest first', async () => {
    const second = await api('post', '/templates', 'ada', { title: `Second ${word}`, category: 'games', items: [{ name: 'Other' }] });
    const third = await api('post', '/templates', 'ada', { title: `Third ${word}` });
    otherTemplate = second.body;

    const first = await api('get', `/templates?q=${word}&limit=2`);
    assert.deepEqual(ids(first.body.items), [third.body.template._id, second.body.template._id]);
    assert.ok(first.body.nextCursor);

    const rest = await api('get', `/templates?q=${word}&limit=2&cursor=${first.body.nextCursor}`);
    assert.deepEqual(ids(rest.body.items), [template._id]);
    assert.equal(rest.body.nextCursor, null);

    const games = await api('get', `/templates?q=${word}&category=Games`);
    assert.deepEqual(ids(games.body.items), [second.body.template._id]);
  });

  test('search matches the start of words, in any case, with every word required', async () => {
    const search = async (q) => ids((await api('get', `/templates?q=${encodeURIComponent(q)}`)).body.items);
    assert.deepEqual(await search(`${word} snac`), [template._id], 'a word start finds Snacks');
    assert.deepEqual(await search(`${word} SNACKS`), [template._id], 'case does not matter');
    assert.deepEqual(await search(`${word} nacks`), [], 'the middle of a word does not match');
    assert.deepEqual(await search(`${word} snacks pizza`), [], 'every word has to match');
    assert.deepEqual(await search(`${word.slice(0, 5)}`).then((found) => found.includes(template._id)), true);
    assert.equal((await api('get', '/templates?q=%28%5B*')).status, 200, 'regex characters are taken literally');
  });

  test('only the owner can change a template or its items', async () => {
    assert.equal((await api('patch', `/templates/${template._id}`, 'bob', { title: 'Mine now' })).status, 403);
    assert.equal((await api('patch', `/templates/${privateTemplate._id}`, 'bob', { title: 'Mine now' })).status, 404);
    assert.equal((await api('post', `/templates/${template._id}/items`, 'bob', { name: 'Soda' })).status, 403);

    const patched = await api('patch', `/templates/${template._id}`, 'ada', { description: 'The classics' });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.description, 'The classics');
    assert.equal(patched.body.title, `Snacks ${word}`);

    const soda = await api('post', `/templates/${template._id}/items`, 'ada', { name: 'Soda' });
    assert.equal(soda.status, 201);

    const renamed = await api('patch', `/templates/${template._id}/items/${soda.body._id}`, 'ada', { name: 'Cola' });
    assert.equal(renamed.body.name, 'Cola');

    // An item id from a different template is not found under this one
    const wrong = await api('patch', `/templates/${template._id}/items/${otherTemplate.items[0]._id}`, 'ada', { name: 'x' });
    assert.equal(wrong.status, 404);

    const fresh = await api('get', `/templates/${template._id}`);
    assert.deepEqual(fresh.body.items.map((item) => item.name), ['Chips', 'Jerky', 'Gum', 'Cola']);
  });

  test('starting a ranking gives a draft with the template tiers, once per person', async () => {
    const res = await api('post', `/templates/${template._id}/rankings`, 'bob');
    assert.equal(res.status, 201);
    bobs = res.body;

    assert.deepEqual(bobs.tiers.map((entry) => entry.label), ['S', 'A', 'B', 'C', 'D', 'F']);
    assert.deepEqual(bobs.tiers.map((entry) => entry.order), [0, 1, 2, 3, 4, 5]);
    assert.ok(bobs.tiers.every((entry) => /^#[0-9a-f]{6}$/.test(entry.color) && entry.itemIds.length === 0));
    assert.equal(bobs.publishedAt, null);

    const again = await api('post', `/templates/${template._id}/rankings`, 'bob');
    assert.equal(again.status, 200);
    assert.equal(again.body._id, bobs._id);

    assert.equal((await api('post', `/templates/${privateTemplate._id}/rankings`, 'bob')).status, 404);
  });

  test('two requests racing to start the same ranking end up with one', async () => {
    const path = `/templates/${otherTemplate.template._id}/rankings`;
    const [first, second] = await Promise.all([api('post', path, 'eve'), api('post', path, 'eve')]);

    assert.deepEqual([first.status, second.status].sort(), [200, 201]);
    assert.equal(first.body._id, second.body._id);
    assert.equal(await Ranking.countDocuments({ templateId: otherTemplate.template._id, ownerId: users.eve._id }), 1);
  });

  test('a draft is only visible to its owner', async () => {
    assert.equal((await api('get', `/rankings/${bobs._id}`)).status, 404);
    assert.equal((await api('get', `/rankings/${bobs._id}`, 'eve')).status, 404);
    assert.equal((await api('put', `/rankings/${bobs._id}`, 'eve', { visibility: 'public', tiers: board([], [], [], []) })).status, 404);

    const mine = await api('get', `/rankings/${bobs._id}`, 'bob');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.items.length, 4);
    assert.equal(mine.body.template._id, template._id);
    assert.equal(mine.body.owner.username, users.bob.username);
    assert.equal(mine.body.likedByMe, false);
  });

  test('saving refuses items from another template, and a plain save stays a draft', async () => {
    const foreign = await api('put', `/rankings/${bobs._id}`, 'bob', {
      visibility: 'public',
      tiers: board([chips, otherTemplate.items[0]], [], [], []),
    });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.error, 'Every item must belong to the template being ranked');

    const saved = await api('put', `/rankings/${bobs._id}`, 'bob', {
      title: 'Road trip picks',
      visibility: 'public',
      tiers: board([chips], [jerky], [], [gum]),
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.ranking.publishedAt, null);
    assert.deepEqual(saved.body.ranking.tiers.map((entry) => entry.order), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(saved.body.ranking.tiers[0].itemIds, [chips._id]);

    assert.equal((await Template.findById(template._id)).rankingCount, 0);
    assert.equal(await Notification.countDocuments({ recipientId: users.ada._id }), 0);
  });

  test('the first publish counts the ranking and notifies the template owner, once', async () => {
    // Ada has a phone registered. Push delivery is not written yet, and that must not fail the request.
    await User.updateOne({ _id: users.ada._id }, { $addToSet: { pushTokens: 'ExponentPushToken[test]' } });
    const before = await Template.findById(template._id);
    const body = { visibility: 'public', tiers: board([chips], [jerky], [], [gum]), publish: true };

    const published = await api('put', `/rankings/${bobs._id}`, 'bob', body);
    assert.equal(published.status, 200);
    assert.ok(published.body.ranking.publishedAt);
    assert.equal(published.body.ranking.title, 'Road trip picks');
    assert.ok(published.body.shareUrl.endsWith(`/rankings/${bobs._id}`));

    const again = await api('put', `/rankings/${bobs._id}`, 'bob', body);
    assert.equal(again.body.ranking.publishedAt, published.body.ranking.publishedAt);

    const after = await Template.findById(template._id);
    assert.equal(after.rankingCount, 1);
    assert.deepEqual(after.updatedAt, before.updatedAt);

    const notifications = await Notification.find({ recipientId: users.ada._id }).lean();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'new_ranking');
    assert.equal(String(notifications[0].actorId), String(users.bob._id));
    assert.equal(notifications[0].read, false);

    // Now that it is published, a stranger can see it but still not change it
    assert.equal((await api('get', `/rankings/${bobs._id}`)).status, 200);
    assert.equal((await api('put', `/rankings/${bobs._id}`, 'eve', body)).status, 403);
  });

  test('ranking your own template notifies nobody', async () => {
    const started = await api('post', `/templates/${template._id}/rankings`, 'ada');
    adas = started.body;

    const published = await api('put', `/rankings/${adas._id}`, 'ada', {
      visibility: 'public',
      tiers: board([chips], [], [jerky], [gum]),
      publish: true,
    });
    assert.equal(published.status, 200);
    assert.equal((await Template.findById(template._id)).rankingCount, 2);
    assert.equal(await Notification.countDocuments({ recipientId: users.ada._id }), 1);
  });

  test('published rankings show up in the feed and under their template', async () => {
    const feed = await api('get', '/rankings?limit=50');
    const mine = feed.body.items.filter((entry) => [bobs._id, adas._id].includes(entry._id));
    assert.deepEqual(ids(mine), [adas._id, bobs._id]);
    assert.equal(mine[1].owner.username, users.bob.username);
    assert.equal(mine[1].template.title, `Snacks ${word}`);

    const underTemplate = await api('get', `/templates/${template._id}/rankings?limit=1`);
    assert.deepEqual(ids(underTemplate.body.items), [adas._id]);
    const next = await api('get', `/templates/${template._id}/rankings?limit=1&cursor=${underTemplate.body.nextCursor}`);
    assert.deepEqual(ids(next.body.items), [bobs._id]);
    assert.equal(next.body.nextCursor, null);
  });

  test('the community ranking averages everyone', async () => {
    // Chips: S and S. Jerky: A and C, which averages to B. Gum: F and F. Cola: unranked by both.
    const res = await api('get', `/templates/${template._id}/community-ranking`);
    assert.equal(res.status, 200);
    assert.equal(res.body.rankingCount, 2);
    assert.deepEqual(
      res.body.tiers.map((entry) => [entry.label, entry.itemIds]),
      [['S', [chips._id]], ['A', []], ['B', [jerky._id]], ['C', []], ['D', []], ['F', [gum._id]]],
    );
  });

  test('likes count once per person and only notify people who asked for it', async () => {
    const before = await Ranking.findById(bobs._id);

    const liked = await api('put', `/rankings/${bobs._id}/like`, 'ada');
    assert.deepEqual(liked.body, { liked: true, likeCount: 1 });
    assert.deepEqual((await api('put', `/rankings/${bobs._id}/like`, 'ada')).body, { liked: true, likeCount: 1 });
    assert.equal(await Like.countDocuments({ rankingId: bobs._id }), 1);

    // Likes are off by default in notificationPrefs
    assert.equal(await Notification.countDocuments({ recipientId: users.bob._id }), 0);
    await User.updateOne({ _id: users.bob._id }, { 'notificationPrefs.newLike': true });

    // Two taps at the same moment still count as one like
    const taps = await Promise.all([
      api('put', `/rankings/${bobs._id}/like`, 'eve'),
      api('put', `/rankings/${bobs._id}/like`, 'eve'),
    ]);
    assert.deepEqual(taps.map((res) => res.status), [200, 200]);
    assert.deepEqual((await api('put', `/rankings/${bobs._id}/like`, 'eve')).body, { liked: true, likeCount: 2 });
    const notifications = await Notification.find({ recipientId: users.bob._id }).lean();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'new_like');
    assert.equal(String(notifications[0].actorId), String(users.eve._id));

    assert.equal((await api('get', `/rankings/${bobs._id}`, 'ada')).body.likedByMe, true);
    assert.equal((await api('get', `/rankings/${bobs._id}`)).body.likedByMe, false);

    assert.deepEqual((await api('delete', `/rankings/${bobs._id}/like`, 'eve')).body, { liked: false, likeCount: 1 });
    assert.deepEqual((await api('delete', `/rankings/${bobs._id}/like`, 'eve')).body, { liked: false, likeCount: 1 });

    // Likes do not count as the owner editing the ranking
    assert.deepEqual((await Ranking.findById(bobs._id)).updatedAt, before.updatedAt);
  });

  test('"popular" and "top" sort by rankings and likes', async () => {
    const popular = await api('get', `/templates?q=${word}&sort=popular&limit=1`);
    assert.deepEqual(ids(popular.body.items), [template._id]);
    assert.ok(popular.body.nextCursor);
    const next = await api('get', `/templates?q=${word}&sort=popular&limit=5&cursor=${popular.body.nextCursor}`);
    assert.equal(next.body.items.length, 2);
    assert.equal(ids(next.body.items).includes(template._id), false);

    const top = await api('get', '/rankings?sort=top&limit=50');
    const mine = top.body.items.filter((entry) => [bobs._id, adas._id].includes(entry._id));
    assert.deepEqual(ids(mine), [bobs._id, adas._id]);
  });

  test('removing an item takes it out of every ranking', async () => {
    assert.equal((await api('delete', `/templates/${template._id}/items/${jerky._id}`, 'bob')).status, 403);
    assert.equal((await api('delete', `/templates/${template._id}/items/${jerky._id}`, 'ada')).status, 204);
    assert.equal((await api('delete', `/templates/${template._id}/items/${jerky._id}`, 'ada')).status, 404);

    for (const ranking of await Ranking.find({ templateId: template._id }).lean()) {
      const placed = ranking.tiers.flatMap((entry) => entry.itemIds.map(String));
      assert.deepEqual(placed.sort(), [chips._id, gum._id].sort());
    }
    assert.equal((await api('get', `/templates/${template._id}`)).body.items.length, 3);
  });

  test('deleting a ranking removes what hangs off it and lowers the count', async () => {
    assert.equal((await api('delete', `/rankings/${bobs._id}`, 'eve')).status, 403);
    assert.equal((await api('delete', `/rankings/${bobs._id}`, 'bob')).status, 204);

    assert.equal((await api('get', `/rankings/${bobs._id}`, 'bob')).status, 404);
    assert.equal(await Like.countDocuments({ rankingId: bobs._id }), 0);
    assert.equal(await Notification.countDocuments({ rankingId: bobs._id }), 0);
    assert.equal((await Template.findById(template._id)).rankingCount, 1);
  });

  test('deleting a template removes its items and rankings', async () => {
    assert.equal((await api('delete', `/templates/${template._id}`, 'bob')).status, 403);
    assert.equal((await api('delete', `/templates/${template._id}`, 'ada')).status, 204);

    assert.equal((await api('get', `/templates/${template._id}`, 'ada')).status, 404);
    assert.equal(await Item.countDocuments({ templateId: template._id }), 0);
    assert.equal(await Ranking.countDocuments({ templateId: template._id }), 0);
    assert.equal((await api('get', `/rankings/${adas._id}`, 'ada')).status, 404);
  });
});
