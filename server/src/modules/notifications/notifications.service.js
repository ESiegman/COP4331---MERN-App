import { pushClient } from '../../integrations/push.js';
import { notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { findPage } from '../../lib/pagination.js';
import { Notification, Ranking, Template, User } from '../../models/index.js';
import { findPublicProfiles } from '../users/users.service.js';

// NotificationService from the class diagram.

// Which switch in User.notificationPrefs controls each notification type
const PREF_FOR_TYPE = {
  new_comment: 'newComment',
  new_ranking: 'newRanking',
  new_like: 'newLike',
};

// Nobody is notified about their own actions, and each type has an on/off switch, except
// content_removed: people always hear when a moderator removed something of theirs.
// `recipient` is a user document or plain object with _id and notificationPrefs.
export function shouldNotify(recipient, actorId, type) {
  if (String(recipient._id) === String(actorId)) return false;
  if (type === 'content_removed') return true;
  return recipient.notificationPrefs?.[PREF_FOR_TYPE[type]] === true;
}

const PUSH_TEXT = {
  new_ranking: (name, title) => `${name} ranked your ${title} list`,
  new_comment: (name, title) => `${name} commented on your ${title} ranking`,
  new_like: (name, title) => `${name} liked your ${title} ranking`,
};

const REMOVED_TEXT = {
  template: (title) => `A moderator removed your template "${title}"`,
  ranking: (title) => `A moderator removed your ranking "${title}"`,
  comment: (title) => `A moderator removed your comment "${title}"`,
};

const noPush = async () => {};

// The push text for a notification about a ranking: "Ada ranked your Snacks list"
async function rankingMessage({ _id, actorId, type, rankingId }) {
  const actor = await User.findById(actorId).select('username displayName').lean();
  const ranking = await Ranking.findById(rankingId).select('templateId').lean();
  const template = await Template.findById(ranking.templateId).select('title').lean();
  return {
    body: PUSH_TEXT[type](actor.displayName ?? actor.username, template.title),
    data: { rankingId: String(rankingId), notificationId: String(_id) },
  };
}

// A failed push is logged and never thrown: the action that caused it has already happened
async function push(pushTokens, notification, message) {
  try {
    const { body, data } = await message(notification);
    const gone = await pushClient.send(pushTokens, { title: 'Tier List', body, data });
    // Expo says these phones no longer have the app: stop sending to them
    if (gone.length > 0) {
      await User.updateOne({ _id: notification.recipientId }, { $pull: { pushTokens: { $in: gone } } });
    }
  } catch (err) {
    logger.warn({ err }, 'Could not send push notification');
  }
}

/**
 * Called by the ranking, like and comment services. Not a route.
 *
 * Saves a Notification for the recipient if shouldNotify() allows it. Call it inside the
 * caller's withTransaction(): it joins that transaction, so the notification only exists if
 * the action it describes was saved.
 *
 * Returns a function that sends the push message. Call that after the transaction has
 * committed, so a phone never buzzes for something that was rolled back:
 *
 *   const sendPush = await withTransaction(async () => {
 *     ...
 *     return notify(ownerId, userId, 'new_like', ranking._id);
 *   });
 *   await sendPush();
 */
export async function notify(recipientId, actorId, type, rankingId) {
  const recipient = await User.findById(recipientId).select('notificationPrefs pushTokens').lean();
  if (!recipient || !shouldNotify(recipient, actorId, type)) return noPush;

  const notification = await Notification.create({ recipientId, actorId, type, rankingId });
  if (!recipient.pushTokens?.length) return noPush;

  return () => push(recipient.pushTokens, notification, rankingMessage);
}

/**
 * Called by the content services when a moderator removes someone else's template, ranking or
 * comment. Used like notify(): inside the transaction, then call what it returns afterwards.
 * removed is { kind, title, reason }. rankingId is the ranking a removed comment was on.
 */
export async function notifyRemoval(recipientId, moderatorId, removed, rankingId) {
  const recipient = await User.findById(recipientId).select('notificationPrefs pushTokens').lean();
  if (!recipient || !shouldNotify(recipient, moderatorId, 'content_removed')) return noPush;

  const notification = await Notification.create({
    recipientId, actorId: moderatorId, type: 'content_removed', rankingId, removed,
  });
  if (!recipient.pushTokens?.length) return noPush;

  const message = () => ({
    body: REMOVED_TEXT[removed.kind](removed.title),
    data: { notificationId: String(notification._id), ...(rankingId && { rankingId: String(rankingId) }) },
  });
  return () => push(recipient.pushTokens, notification, message);
}

// GET /notifications  (Receive notifications)
// Newest first. Each entry carries who did it and which ranking and template it is about,
// so the apps can show "Ada ranked your Snacks list" without more requests. A content_removed
// entry says what was removed instead, and never which moderator removed it.
export async function listNotifications(userId, { unread, cursor, limit }) {
  const filter = unread ? { recipientId: userId, read: false } : { recipientId: userId };

  const [page, unreadCount] = await Promise.all([
    findPage(Notification, filter, { sortBy: 'createdAt', cursor, limit }),
    Notification.countDocuments({ recipientId: userId, read: false }),
  ]);

  const [actors, rankings] = await Promise.all([
    findPublicProfiles(page.items.map((notification) => notification.actorId)),
    Ranking.find({ _id: { $in: page.items.map((notification) => notification.rankingId).filter(Boolean) } })
      .select('title templateId')
      .lean(),
  ]);
  const templates = await Template.find({ _id: { $in: rankings.map((ranking) => ranking.templateId) } })
    .select('title')
    .lean();

  const templatesById = new Map(templates.map((template) => [String(template._id), template]));
  const rankingsById = new Map(
    rankings.map((ranking) => [
      String(ranking._id),
      { _id: ranking._id, title: ranking.title, template: templatesById.get(String(ranking.templateId)) ?? null },
    ]),
  );

  const items = page.items.map(({ actorId, ...notification }) => {
    const fromModerator = notification.type === 'content_removed';
    return {
      ...notification,
      ...(!fromModerator && { actorId }),
      actor: fromModerator ? null : (actors.get(String(actorId)) ?? null),
      ranking: rankingsById.get(String(notification.rankingId)) ?? null,
    };
  });
  return { items, nextCursor: page.nextCursor, unreadCount };
}

// PATCH /notifications/:notificationId
// The apps call this when a push or a list entry is opened. Matching on recipientId as well
// means someone else's notification answers 404 and cannot be touched.
export async function markRead(userId, notificationId) {
  const { matchedCount } = await Notification.updateOne(
    { _id: notificationId, recipientId: userId },
    { read: true },
  );
  if (matchedCount === 0) throw notFound('Notification');
}

// POST /notifications/read-all
export async function markAllRead(userId) {
  await Notification.updateMany({ recipientId: userId, read: false }, { read: true });
}
