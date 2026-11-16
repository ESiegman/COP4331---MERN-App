import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import {
  AuthToken, Comment, Item, Like, Notification, OAuthAccount, Ranking, Template, User,
} from '../src/models/index.js';

// Saves one document of every model into a database prepared by db/setup.js. If a model and
// its validator there disagree, the insert fails here instead of in production.
// Skipped unless MONGODB_URI is set (see auth.integration.test.js).

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';

describe('models match the validators in db/setup.js', { skip }, () => {
  const run = randomBytes(4).toString('hex'); // random, because test files run at the same time
  const saved = [];
  const save = async (Model, fields) => {
    const doc = await Model.create(fields);
    saved.push(doc);
    return doc;
  };

  before(() => connectDb());

  after(async () => {
    for (const doc of saved.reverse()) await doc.deleteOne();
    await disconnectDb();
  });

  test('every model saves with only its required fields, and its defaults match the ERD', async () => {
    // No password: this is what an account made through Google or Discord looks like
    const user = await save(User, { username: `m_${run}`, email: `m_${run}@example.com` });
    const raw = await User.collection.findOne({ _id: user._id });
    assert.equal(raw.passwordHash, null);
    assert.equal(raw.emailVerified, false);
    assert.deepEqual(raw.pushTokens, []);
    assert.deepEqual(raw.notificationPrefs, { newComment: true, newRanking: true, newLike: false });
    assert.ok(raw.createdAt instanceof Date);

    const template = await save(Template, { ownerId: user._id, title: 'Gas station snacks' });
    assert.deepEqual([...template.tierLabels], ['S', 'A', 'B', 'C', 'D', 'F']);
    assert.equal(template.visibility, 'public');
    assert.equal(template.rankingCount, 0);
    assert.equal(template.coverImageUrl, null);

    const item = await save(Item, { templateId: template._id, name: 'Chips' });
    assert.equal(item.imageUrl, null);

    const ranking = await save(Ranking, {
      templateId: template._id,
      ownerId: user._id,
      tiers: [{ label: 'S', color: '#ff7f7f', order: 0, itemIds: [item._id] }],
    });
    assert.equal(ranking.publishedAt, null);
    assert.equal(ranking.likeCount, 0);
    assert.equal(ranking.commentCount, 0);
    const rawRanking = await Ranking.collection.findOne({ _id: ranking._id });
    assert.deepEqual(Object.keys(rawRanking.tiers[0]).sort(), ['color', 'itemIds', 'label', 'order']);

    await save(Comment, { rankingId: ranking._id, authorId: user._id, body: 'Chips in S tier, obviously' });
    await save(Like, { rankingId: ranking._id, userId: user._id });
    const notification = await save(Notification, {
      recipientId: user._id, actorId: user._id, type: 'new_ranking', rankingId: ranking._id,
    });
    assert.equal(notification.read, false);

    await save(OAuthAccount, { userId: user._id, provider: 'google', providerUserId: `g_${run}` });
    const authToken = await save(AuthToken, {
      userId: user._id, type: 'verify_email', tokenHash: `h_${run}`, expiresAt: new Date(Date.now() + 60_000),
    });
    assert.equal(authToken.usedAt, null);
  });

  test('every model also saves with all of its optional fields filled in', async () => {
    const user = await save(User, {
      username: `f_${run}`, email: `f_${run}@example.com`, passwordHash: 'hash', emailVerified: true,
      displayName: 'Full', bio: 'bio', avatarUrl: 'https://img.example.com/a.png',
      pushTokens: ['ExponentPushToken[abc]'], notificationPrefs: { newLike: true },
    });
    const template = await save(Template, {
      ownerId: user._id, title: 'Full', description: 'everything set', category: 'Food',
      coverImageUrl: 'https://img.example.com/c.png', tierLabels: ['Top', 'Bottom'], visibility: 'unlisted',
    });
    assert.equal(template.category, 'food');
    const item = await save(Item, { templateId: template._id, name: 'Chips', imageUrl: 'https://img.example.com/i.png' });
    await save(Ranking, {
      templateId: template._id, ownerId: user._id, title: 'Mine', visibility: 'private', publishedAt: new Date(),
      tiers: [
        { label: 'Top', color: '#ff7f7f', order: 0, itemIds: [item._id] },
        { label: 'Bottom', color: '#7fbfff', order: 1, itemIds: [] },
      ],
    });
    await save(OAuthAccount, { userId: user._id, provider: 'discord', providerUserId: `d_${run}`, email: 'F@Example.com' });
    await save(AuthToken, {
      userId: user._id, type: 'reset_password', tokenHash: `r_${run}`, expiresAt: new Date(Date.now() + 60_000), usedAt: new Date(),
    });
  });
});
