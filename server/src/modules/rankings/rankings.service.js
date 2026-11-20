import { KEEP_UPDATED_AT, withTransaction } from '../../lib/db.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { findPage } from '../../lib/pagination.js';
import { isModerator } from '../../lib/roles.js';
import { effectiveVisibility, isOwner, shareUrl } from '../../lib/sharedContent.js';
import {
  Comment, DEFAULT_TIER_COLORS, Item, Like, Notification, Ranking, Template,
} from '../../models/index.js';
import { removedByModerator } from '../admin/admin.service.js';
import { notify } from '../notifications/notifications.service.js';
import { findViewableTemplate, recountRankings } from '../templates/templates.service.js';
import { findPublicProfiles } from '../users/users.service.js';

// RankingService from the class diagram, plus Ranking.like and the feed.
// saveRanking follows the "Publish a ranking" sequence diagram step by step.
// A ranking with publishedAt === null is a draft, and only its owner can see it.
// A ranking is also never more visible than its template (see effectiveVisibility).

// Published rankings set to public: what a template's page, the community ranking and
// Template.rankingCount count
const PUBLISHED = { visibility: 'public', publishedAt: { $ne: null } };

const colorAt = (position) => DEFAULT_TIER_COLORS[position % DEFAULT_TIER_COLORS.length];

// Rankings of unlisted and private templates stay out of the feed and profile lists, since
// listing them would reveal the template. Usually a short list.
const hiddenTemplateIds = () => Template.find({ visibility: { $ne: 'public' } }).distinct('_id');

// A ranking that is private, a draft, or ranks a private template answers 404 to everyone
// but its owner. The owner always sees their own.
export async function findViewableRanking(viewerId, rankingId) {
  const ranking = await Ranking.findById(rankingId);
  if (!ranking) throw notFound('Ranking');
  if (isOwner(ranking, viewerId)) return ranking;

  const template = await Template.findById(ranking.templateId).select('visibility').lean();
  const visible = ranking.publishedAt && template && effectiveVisibility(ranking, template) !== 'private';
  if (!visible) throw notFound('Ranking');
  return ranking;
}


async function findOwnRanking(userId, rankingId) {
  const ranking = await findViewableRanking(userId, rankingId);
  if (!isOwner(ranking, userId)) throw forbidden('Only the owner can change this ranking');
  return ranking;
}

// Adds who made each ranking and which template it ranks: two queries for the whole page
async function withSummaries(page) {
  const [profiles, templates] = await Promise.all([
    findPublicProfiles(page.items.map((ranking) => ranking.ownerId)),
    Template.find({ _id: { $in: page.items.map((ranking) => ranking.templateId) } })
      .select('title coverImageUrl')
      .lean(),
  ]);
  const templatesById = new Map(templates.map((template) => [String(template._id), template]));

  const items = page.items.map((ranking) => ({
    ...ranking,
    owner: profiles.get(String(ranking.ownerId)) ?? null,
    template: templatesById.get(String(ranking.templateId)) ?? null,
  }));
  return { items, nextCursor: page.nextCursor };
}

// GET /rankings  (Browse tier lists)
export async function listFeed({ sort, cursor, limit }) {
  const sortBy = sort === 'top' ? 'likeCount' : 'publishedAt';
  const filter = { ...PUBLISHED, templateId: { $nin: await hiddenTemplateIds() } };
  return withSummaries(await findPage(Ranking, filter, { sortBy, cursor, limit }));
}

// GET /users/:username/rankings
// Everyone sees the owner's public, published rankings of public templates. The owner also
// sees their drafts and private ones.
export async function listByOwner(owner, viewerId, { cursor, limit }) {
  const viewerIsOwner = String(owner._id) === String(viewerId);
  const filter = viewerIsOwner
    ? { ownerId: owner._id }
    : { ownerId: owner._id, ...PUBLISHED, templateId: { $nin: await hiddenTemplateIds() } };
  return withSummaries(await findPage(Ranking, filter, { sortBy: 'createdAt', cursor, limit }));
}

// GET /templates/:templateId/rankings
// Rankings of a private template are private too, so that list is always empty.
export async function listForTemplate(viewerId, templateId, { cursor, limit }) {
  const template = await findViewableTemplate(viewerId, templateId);
  if (template.visibility === 'private') return { items: [], nextCursor: null };
  const filter = { templateId: template._id, ...PUBLISHED };
  return withSummaries(await findPage(Ranking, filter, { sortBy: 'publishedAt', cursor, limit }));
}

// Turns each item's average score (0 = top tier, 1 = bottom tier) into tiers with the
// template's own labels. An item lands in the tier nearest its average, best items first.
export function spreadOverTiers(scores, tierLabels) {
  const last = tierLabels.length - 1;
  const tiers = tierLabels.map((label, position) => ({ label, color: colorAt(position), itemIds: [] }));

  const bestFirst = scores.toSorted((a, b) => a.score - b.score || b.votes - a.votes);
  for (const { _id, score } of bestFirst) {
    tiers[Math.round(score * last)].itemIds.push(_id);
  }
  return tiers;
}

// GET /templates/:templateId/community-ranking  (View community ranking)
// Computed on the fly from the public rankings, no extra collection. People can add or
// remove tiers, so a placement is scored by how far down the list its tier sits:
// tier.order / (number of tiers - 1). That is averaged per item across all rankings.
export async function communityRanking(viewerId, templateId) {
  const template = await findViewableTemplate(viewerId, templateId);
  // Rankings of a private template are private, so there is nothing to average
  const match = { templateId: template._id, ...PUBLISHED };
  if (template.visibility === 'private') match._id = { $in: [] };

  const [scores, rankingCount] = await Promise.all([
    Ranking.aggregate([
      { $match: match },
      { $project: { tiers: 1, last: { $max: [{ $subtract: [{ $size: '$tiers' }, 1] }, 1] } } },
      { $unwind: '$tiers' },
      { $unwind: '$tiers.itemIds' },
      {
        $group: {
          _id: '$tiers.itemIds',
          score: { $avg: { $divide: ['$tiers.order', '$last'] } },
          votes: { $sum: 1 },
        },
      },
    ]),
    Ranking.countDocuments(match),
  ]);

  return { tiers: spreadOverTiers(scores, [...template.tierLabels]), rankingCount };
}

// POST /templates/:templateId/rankings  (Rank a template)
// Get-or-create: the database allows one ranking per person per template. A new one starts
// as a draft with the template's tiers and nothing placed yet.
export async function startRanking(userId, templateId) {
  const template = await findViewableTemplate(userId, templateId);
  const mine = { templateId: template._id, ownerId: userId };

  const existing = await Ranking.findOne(mine);
  if (existing) return { ranking: existing, created: false };

  const tiers = template.tierLabels.map((label, order) => ({ label, color: colorAt(order), order, itemIds: [] }));
  try {
    return { ranking: await Ranking.create({ ...mine, tiers }), created: true };
  } catch (err) {
    // Two requests raced and the unique index let only one through: hand back the winner
    if (err.code !== 11000) throw err;
    return { ranking: await Ranking.findOne(mine), created: false };
  }
}

// GET /rankings/:rankingId  (View a ranking)
// Everything the client needs to draw the board in one response, unranked items included.
export async function getRanking(viewerId, rankingId) {
  const ranking = await findViewableRanking(viewerId, rankingId);

  const [template, items, profiles, like] = await Promise.all([
    Template.findById(ranking.templateId).lean(),
    Item.find({ templateId: ranking.templateId }).sort({ _id: 1 }).lean(),
    findPublicProfiles([ranking.ownerId]),
    viewerId ? Like.exists({ rankingId: ranking._id, userId: viewerId }) : null,
  ]);

  return {
    ranking,
    template,
    items,
    owner: profiles.get(String(ranking.ownerId)) ?? null,
    likedByMe: Boolean(like),
    shareUrl: shareUrl('rankings', ranking._id),
  };
}

// PUT /rankings/:rankingId  (Rank a template, Edit own ranking)
// The numbered steps are the ones in the sequence diagram.
export async function saveRanking(userId, rankingId, { title, tiers, visibility, publish }) {
  // 3. Caller owns this ranking
  const ranking = await findOwnRanking(userId, rankingId);

  // 4-5. Every item belongs to the template. The request schema has already refused an item
  // that appears twice, so counting the matches is enough.
  const itemIds = tiers.flatMap((tier) => tier.itemIds);
  const known = await Item.countDocuments({ templateId: ranking.templateId, _id: { $in: itemIds } });
  if (known !== itemIds.length) throw badRequest('Every item must belong to the template being ranked');

  const firstPublish = publish && !ranking.publishedAt;

  // A title that is left out is kept, so autosaves do not have to resend it
  if (title !== undefined) ranking.title = title;
  ranking.visibility = visibility;
  ranking.tiers = tiers.map((tier, order) => ({ ...tier, order }));
  if (firstPublish) ranking.publishedAt = new Date();

  const sendPush = await withTransaction(async () => {
    // 6. Save tiers, set publishedAt
    await ranking.save();
    if (!ranking.publishedAt) return null;

    // 7. Recount Template.rankingCount (a published ranking may also have changed visibility)
    await recountRankings(ranking.templateId);
    if (!firstPublish) return null;

    // 8-9. Notify the template's owner, unless they could not open the ranking anyway
    const template = await Template.findById(ranking.templateId).select('ownerId visibility').lean();
    if (effectiveVisibility(ranking, template) === 'private') return null;
    return notify(template.ownerId, userId, 'new_ranking', ranking._id);
  });

  // 10. Send push, only once everything above is saved
  await sendPush?.();

  return { ranking, shareUrl: shareUrl('rankings', ranking._id) };
}

// DELETE /rankings/:rankingId  (Delete own ranking)
// A moderator can delete anyone's ranking they can see; that is logged and the owner is told.
export async function deleteRanking(userId, rankingId, { role, reason } = {}) {
  const ranking = await findViewableRanking(userId, rankingId);
  const byModerator = !isOwner(ranking, userId);
  if (byModerator && !isModerator(role)) throw forbidden('Only the owner can change this ranking');

  const sendPush = await withTransaction(async () => {
    await Comment.deleteMany({ rankingId: ranking._id });
    await Like.deleteMany({ rankingId: ranking._id });
    await Notification.deleteMany({ rankingId: ranking._id });
    await ranking.deleteOne();

    if (ranking.publishedAt) await recountRankings(ranking.templateId);

    if (!byModerator) return null;
    const title = ranking.title || (await Template.findById(ranking.templateId).select('title').lean())?.title || 'Untitled';
    return removedByModerator(userId, ranking.ownerId, { kind: 'ranking', contentId: ranking._id, title, reason });
  });
  await sendPush?.();
}

const likeCountOf = async (rankingId) => (await Ranking.findById(rankingId).select('likeCount').lean()).likeCount;

// PUT /rankings/:rankingId/like  (Like ranking)
// Liking twice changes nothing: the unique index on (rankingId, userId) refuses the second like.
export async function like(userId, rankingId) {
  const ranking = await findViewableRanking(userId, rankingId);
  if (!ranking.publishedAt) throw badRequest('Only published rankings can be liked');

  let sendPush;
  try {
    sendPush = await withTransaction(async () => {
      await Like.create({ rankingId: ranking._id, userId });
      await Ranking.updateOne({ _id: ranking._id }, { $inc: { likeCount: 1 } }, KEEP_UPDATED_AT);
      return notify(ranking.ownerId, userId, 'new_like', ranking._id);
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  await sendPush?.();

  return { liked: true, likeCount: await likeCountOf(ranking._id) };
}

// DELETE /rankings/:rankingId/like
// The count only goes down if a like was actually removed.
export async function unlike(userId, rankingId) {
  const ranking = await findViewableRanking(userId, rankingId);

  await withTransaction(async () => {
    const { deletedCount } = await Like.deleteOne({ rankingId: ranking._id, userId });
    if (deletedCount === 1) {
      await Ranking.updateOne({ _id: ranking._id }, { $inc: { likeCount: -1 } }, KEEP_UPDATED_AT);
    }
  });

  return { liked: false, likeCount: await likeCountOf(ranking._id) };
}
