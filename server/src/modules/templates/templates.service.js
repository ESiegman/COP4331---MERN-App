import mongoose from 'mongoose';
import { suggestItemNames } from '../../integrations/ai.js';
import { KEEP_UPDATED_AT, withTransaction } from '../../lib/db.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { findPage } from '../../lib/pagination.js';
import { isModerator } from '../../lib/roles.js';
import { canView, isOwner, shareUrl } from '../../lib/sharedContent.js';
import { Comment, Item, Like, Notification, Ranking, Template } from '../../models/index.js';
import { removedByModerator } from '../admin/admin.service.js';
import { findPublicProfiles } from '../users/users.service.js';

// TemplateService from the class diagram, plus Template.addItem / removeItem.

// Loads a template the viewer is allowed to see. A private template answers 404 to everyone
// but its owner, the same as one that does not exist, so its existence is never confirmed.
export async function findViewableTemplate(viewerId, templateId) {
  const template = await Template.findById(templateId);
  if (!template || !canView(template, viewerId)) throw notFound('Template');
  return template;
}

async function findOwnTemplate(userId, templateId) {
  const template = await findViewableTemplate(userId, templateId);
  if (!isOwner(template, userId)) throw forbidden('Only the owner can change this template');
  return template;
}

// Template.rankingCount is the number of published, public rankings: the ones the template's
// page lists. A private template's rankings are private too, so it counts none. Recounted
// rather than incremented, so it stays right when a ranking or the template changes visibility.
export async function recountRankings(templateId) {
  const template = await Template.findById(templateId).select('visibility').lean();
  const rankingCount = template.visibility === 'private'
    ? 0
    : await Ranking.countDocuments({ templateId, visibility: 'public', publishedAt: { $ne: null } });
  await Template.updateOne({ _id: templateId }, { rankingCount }, KEEP_UPDATED_AT);
}

// Items in the order they were added
const findItems = (templateId) => Item.find({ templateId }).sort({ _id: 1 }).lean();

async function describe(template, items) {
  const profiles = await findPublicProfiles([template.ownerId]);
  return {
    template,
    items,
    owner: profiles.get(String(template.ownerId)) ?? null,
    shareUrl: shareUrl('templates', template._id),
  };
}

// Adds who made each template: one query for the whole page
async function withOwners(page) {
  const profiles = await findPublicProfiles(page.items.map((template) => template.ownerId));
  const items = page.items.map((template) => ({
    ...template,
    owner: profiles.get(String(template.ownerId)) ?? null,
  }));
  return { items, nextCursor: page.nextCursor };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every word typed has to match the start of a word in the title, description or category,
// ignoring case: "snack" finds "Gas station snacks", and "gas sn" finds it too.
function searchFilter(q) {
  const words = q.split(/\s+/).filter(Boolean).slice(0, 8);
  return words.map((word) => {
    const startOfWord = new RegExp(`(^|\\W)${escapeRegex(word)}`, 'i');
    return { $or: [{ title: startOfWord }, { description: startOfWord }, { category: startOfWord }] };
  });
}

// GET /templates  (Browse tier lists, Search templates)
// Only public templates.
export async function listTemplates({ q, category, sort, cursor, limit }) {
  const filter = { visibility: 'public' };
  if (q) filter.$and = searchFilter(q);
  if (category) filter.category = category;

  const sortBy = sort === 'popular' ? 'rankingCount' : 'createdAt';
  return withOwners(await findPage(Template, filter, { sortBy, cursor, limit }));
}

// GET /users/:username/templates
// Everyone sees the owner's public templates. The owner also sees their unlisted and private ones.
export async function listByOwner(owner, viewerId, { cursor, limit }) {
  const filter = { ownerId: owner._id };
  if (String(owner._id) !== String(viewerId)) filter.visibility = 'public';
  return withOwners(await findPage(Template, filter, { sortBy: 'createdAt', cursor, limit }));
}

// POST /templates  (Create template, Add items)
// The template and its starting items are saved together or not at all.
export async function createTemplate(userId, { items, ...fields }) {
  const created = await withTransaction(async () => {
    const template = await Template.create({ ...fields, ownerId: userId });
    const docs = await Item.insertMany(items.map((item) => ({ ...item, templateId: template._id })));
    return { template, items: docs };
  });
  return describe(created.template, created.items);
}

// GET /templates/:templateId
export async function getTemplate(viewerId, templateId) {
  const template = await findViewableTemplate(viewerId, templateId);
  return describe(template, await findItems(template._id));
}

// PATCH /templates/:templateId
// Changing tierLabels only affects rankings started afterwards: existing ones keep their tiers.
export async function updateTemplate(userId, templateId, changes) {
  const template = await findOwnTemplate(userId, templateId);
  const visibilityChanged = changes.visibility !== undefined && changes.visibility !== template.visibility;
  template.set(changes);
  await template.save();

  if (visibilityChanged) {
    await recountRankings(template._id);
    return Template.findById(template._id);
  }
  return template;
}

// DELETE /templates/:templateId
// MongoDB has no cascading deletes, so everything hanging off the template goes in one transaction.
// A moderator can delete anyone's template they can see; that is logged and the owner is told.
export async function deleteTemplate(userId, templateId, { role, reason } = {}) {
  const template = await findViewableTemplate(userId, templateId);
  const byModerator = !isOwner(template, userId);
  if (byModerator && !isModerator(role)) throw forbidden('Only the owner can change this template');

  const sendPush = await withTransaction(async () => {
    const rankingIds = await Ranking.find({ templateId: template._id }).distinct('_id');
    await Comment.deleteMany({ rankingId: { $in: rankingIds } });
    await Like.deleteMany({ rankingId: { $in: rankingIds } });
    await Notification.deleteMany({ rankingId: { $in: rankingIds } });
    await Ranking.deleteMany({ templateId: template._id });
    await Item.deleteMany({ templateId: template._id });
    await template.deleteOne();

    if (!byModerator) return null;
    return removedByModerator(userId, template.ownerId, { kind: 'template', contentId: template._id, title: template.title, reason });
  });
  await sendPush?.();
}

// POST /templates/:templateId/items
// A new item shows up as unranked in every existing ranking: unranked just means "in no tier".
export async function addItem(userId, templateId, input) {
  const template = await findOwnTemplate(userId, templateId);
  return Item.create({ ...input, templateId: template._id });
}

// PATCH /templates/:templateId/items/:itemId
export async function updateItem(userId, templateId, itemId, changes) {
  const template = await findOwnTemplate(userId, templateId);

  const item = await Item.findOne({ _id: itemId, templateId: template._id });
  if (!item) throw notFound('Item');

  item.set(changes);
  await item.save();
  return item;
}

// DELETE /templates/:templateId/items/:itemId
// Also takes the item out of every ranking of this template, so no tier points at nothing.
export async function removeItem(userId, templateId, itemId) {
  const template = await findOwnTemplate(userId, templateId);

  await withTransaction(async () => {
    const { deletedCount } = await Item.deleteOne({ _id: itemId, templateId: template._id });
    if (deletedCount === 0) throw notFound('Item');

    await Ranking.updateMany(
      { templateId: template._id },
      { $pull: { 'tiers.$[].itemIds': new mongoose.Types.ObjectId(itemId) } },
    );
  });
}

// POST /templates/suggest-items  (Suggest items with AI)
export async function suggestItems({ topic, count }) {
  return { items: await suggestItemNames(topic, count) };
}
