import { withTransaction } from '../../lib/db.js';
import { badRequest, conflict, forbidden } from '../../lib/errors.js';
import { findPage } from '../../lib/pagination.js';
import { hasRole, roleOf } from '../../lib/roles.js';
import { ModerationLog, User } from '../../models/index.js';
import { notifyRemoval } from '../notifications/notifications.service.js';
import { findPublicProfiles, findUserByUsername } from '../users/users.service.js';

// Moderation: removing other people's content, bans, roles, and the log of all of it.
// Moderators remove content through the normal DELETE routes, which call removedByModerator().

const SUMMARY_LENGTH = 100;
const shorten = (text) => (text.length > SUMMARY_LENGTH ? `${text.slice(0, SUMMARY_LENGTH - 1)}…` : text);

const ACTION_FOR_KIND = { template: 'delete_template', ranking: 'delete_ranking', comment: 'delete_comment' };

/**
 * Called by the template, ranking and comment services, inside the delete's transaction, when
 * the person deleting is a moderator and not the owner. Logs it and tells the owner. Returns the
 * push to send once the transaction has committed, like notify().
 */
export async function removedByModerator(moderatorId, ownerId, { kind, contentId, title, reason, rankingId }) {
  const summary = shorten(title);
  await ModerationLog.create({ actorId: moderatorId, action: ACTION_FOR_KIND[kind], targetUserId: ownerId, contentId, summary, reason });
  return notifyRemoval(ownerId, moderatorId, { kind, title: summary, ...(reason && { reason }) }, rankingId);
}

// What moderators see of an account: its public profile, role and ban
function toModerationView(user) {
  const plain = typeof user.toObject === 'function' ? user.toObject() : user;
  const view = {
    _id: plain._id,
    username: plain.username,
    displayName: plain.displayName,
    avatarUrl: plain.avatarUrl,
    role: roleOf(plain),
    bannedAt: plain.bannedAt,
    banReason: plain.banReason,
    createdAt: plain.createdAt,
  };
  return Object.fromEntries(Object.entries(view).filter(([, value]) => value !== undefined));
}

const isSelf = (user, userId) => user._id.equals(userId);

// GET /admin/users?status=staff|banned
export async function listUsers({ status, cursor, limit }) {
  const filter = status === 'staff' ? { role: { $in: ['moderator', 'admin'] } } : { bannedAt: { $ne: null } };
  const page = await findPage(User, filter, { sortBy: 'createdAt', cursor, limit });
  return { items: page.items.map(toModerationView), nextCursor: page.nextCursor };
}

// POST /admin/users/:username/ban
// Moderators can ban users. Admins can also ban moderators. Nobody can ban an admin or themselves.
// Banning again changes the reason. The ban stops every login and token straight away, and the
// account's phones stop getting push notifications.
export async function banUser(actorId, actorRole, username, { reason }) {
  const user = await findUserByUsername(username);
  if (isSelf(user, actorId)) throw badRequest("You can't ban yourself");

  const target = roleOf(user);
  if (target === 'admin') throw forbidden("Admins can't be banned. Change their role first.");
  if (target === 'moderator' && !hasRole(actorRole, 'admin')) throw forbidden('Only admins can ban moderators');

  const update = { bannedAt: user.bannedAt ?? new Date(), pushTokens: [] };
  if (reason) update.banReason = reason;
  else update.$unset = { banReason: 1 };

  const banned = await withTransaction(async () => {
    await ModerationLog.create({ actorId, action: 'ban', targetUserId: user._id, summary: user.username, reason });
    return User.findByIdAndUpdate(user._id, update, { returnDocument: 'after' });
  });
  return toModerationView(banned);
}

// DELETE /admin/users/:username/ban. Unbanning someone who isn't banned changes nothing.
export async function unbanUser(actorId, username) {
  const user = await findUserByUsername(username);
  if (!user.bannedAt) return toModerationView(user);

  const unbanned = await withTransaction(async () => {
    await ModerationLog.create({ actorId, action: 'unban', targetUserId: user._id, summary: user.username });
    return User.findByIdAndUpdate(user._id, { $unset: { bannedAt: 1, banReason: 1 } }, { returnDocument: 'after' });
  });
  return toModerationView(unbanned);
}

// Shared with the setRole command on the server, which has no actor
export async function changeRole(actorId, user, role) {
  const from = roleOf(user);
  if (from === role) return user;

  return withTransaction(async () => {
    await ModerationLog.create({
      ...(actorId && { actorId }),
      action: 'set_role',
      targetUserId: user._id,
      summary: `${user.username}: ${from} to ${role}`,
      ...(!actorId && { reason: 'Set with the setRole command on the server' }),
    });
    return User.findByIdAndUpdate(user._id, { role }, { returnDocument: 'after' });
  });
}

// PUT /admin/users/:username/role  (admins only)
// Admins can't change their own role, so the site always keeps at least one admin.
export async function setRole(actorId, username, role) {
  const user = await findUserByUsername(username);
  if (isSelf(user, actorId)) throw badRequest("You can't change your own role");
  if (user.bannedAt && role !== 'user') throw conflict('Unban them first');

  return toModerationView(await changeRole(actorId, user, role));
}

// GET /admin/log  (admins only). Newest first, with who acted and whose account or content it was.
export async function listLog({ cursor, limit }) {
  const page = await findPage(ModerationLog, {}, { sortBy: 'createdAt', cursor, limit });
  const profiles = await findPublicProfiles(page.items.flatMap((entry) => [entry.actorId, entry.targetUserId]).filter(Boolean));
  const items = page.items.map((entry) => ({
    ...entry,
    actor: entry.actorId ? (profiles.get(String(entry.actorId)) ?? null) : null,
    targetUser: profiles.get(String(entry.targetUserId)) ?? null,
  }));
  return { items, nextCursor: page.nextCursor };
}
