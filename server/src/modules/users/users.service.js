import bcrypt from 'bcryptjs';
import { KEEP_UPDATED_AT, withTransaction } from '../../lib/db.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { AuthToken, Comment, Item, Like, Notification, OAuthAccount, Ranking, Template, User } from '../../models/index.js';
import { recountRankings } from '../templates/templates.service.js';

// "Manage profile" and "Choose notifications" from the use case diagram, plus public profiles.

// A valid token for an account that no longer exists is treated like no token at all
const accountGone = () => unauthorized('This account no longer exists');

async function findAccount(userId) {
  const user = await User.findById(userId);
  if (!user) throw accountGone();
  return user;
}

// Public profiles for a set of user ids, as a Map keyed by id. One query however many ids,
// so lists can show who made each template or ranking.
export async function findPublicProfiles(userIds) {
  const users = await User.find({ _id: { $in: [...new Set(userIds.map(String))] } });
  return new Map(users.map((user) => [String(user._id), user.toPublicProfile()]));
}

// The user behind /users/:username. Their templates and rankings are listed by
// templates.service.listByOwner and rankings.service.listByOwner.
export async function findUserByUsername(username) {
  const user = await User.findOne({ username });
  if (!user) throw notFound('User');
  return user;
}

// GET /users/:username
export async function getProfile(username) {
  return (await findUserByUsername(username)).toPublicProfile();
}

// GET /users/me: the account, plus the ways it can log in, for a settings page
export async function getAccount(userId) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw accountGone();
  const linked = await OAuthAccount.find({ userId }).sort({ linkedAt: 1 });
  return {
    ...user.toAccount(),
    hasPassword: Boolean(user.passwordHash),
    linkedAccounts: linked.map((account) => account.toLinkedAccount()),
  };
}

// PATCH /users/me
export async function updateAccount(userId, { notificationPrefs = {}, ...profile }) {
  const user = await findAccount(userId);

  // null means "clear it". Setting undefined makes Mongoose remove the field, which matters
  // because the database validator rejects null for these.
  for (const [field, value] of Object.entries(profile)) {
    user.set(field, value ?? undefined);
  }
  for (const [switchName, on] of Object.entries(notificationPrefs)) {
    user.set(`notificationPrefs.${switchName}`, on);
  }

  await user.save();
  return user;
}

// POST /users/me/push-tokens  (the Expo app calls this after the user allows notifications)
// A token identifies one phone, and a phone belongs to whoever is logged in on it now. So
// the token is first taken away from any other account, or the previous user's
// notifications would keep arriving on this phone.
export async function addPushToken(userId, token) {
  await User.updateMany({ _id: { $ne: userId }, pushTokens: token }, { $pull: { pushTokens: token } });

  // $addToSet makes registering the same phone twice harmless
  const { matchedCount } = await User.updateOne({ _id: userId }, { $addToSet: { pushTokens: token } });
  if (matchedCount === 0) throw accountGone();
}

// DELETE /users/me/push-tokens  (the Expo app calls this on logout)
export async function removePushToken(userId, token) {
  await User.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
}

// DELETE /users/me  ("Delete account")
// Removes the account and everything it made, the same as deleting each piece by hand: its
// templates (with every ranking made from them, whoever made it), its rankings (with their
// comments and likes), and the comments and likes it left on other people's rankings, whose
// counts go down to match. Notifications to it and about what it did, its email links and its
// Google and Discord links go too. The moderation log keeps its entries, with the user gone.
export async function deleteAccount(userId, { password }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw accountGone();

  // A stolen token alone is not enough to delete an account that has a password
  if (user.passwordHash) {
    if (!password) throw badRequest('Enter your password to delete this account');
    if (!(await bcrypt.compare(password, user.passwordHash))) throw forbidden('Wrong password', 'WRONG_PASSWORD');
  }
  if (user.role === 'admin' && !(await User.exists({ _id: { $ne: user._id }, role: 'admin' }))) {
    throw conflict('You are the only admin. Make someone else admin first.');
  }

  await withTransaction(async () => {
    const templateIds = await Template.find({ ownerId: user._id }).distinct('_id');
    const rankingIds = await Ranking.find({ $or: [{ ownerId: user._id }, { templateId: { $in: templateIds } }] }).distinct('_id');
    const onKeptRankings = { rankingId: { $nin: rankingIds } };

    // Counters on the rankings that stay
    const comments = await Comment.find({ authorId: user._id, ...onKeptRankings }).select('rankingId').lean();
    const commentsPerRanking = Map.groupBy(comments, (comment) => String(comment.rankingId));
    for (const [rankingId, theirs] of commentsPerRanking) {
      await Ranking.updateOne({ _id: rankingId }, { $inc: { commentCount: -theirs.length } }, KEEP_UPDATED_AT);
    }
    const liked = await Like.find({ userId: user._id, ...onKeptRankings }).distinct('rankingId');
    await Ranking.updateMany({ _id: { $in: liked } }, { $inc: { likeCount: -1 } }, KEEP_UPDATED_AT);

    // Other people's templates this account published rankings of, whose counts change
    const rankedTemplateIds = await Ranking.find({
      ownerId: user._id, templateId: { $nin: templateIds }, publishedAt: { $ne: null },
    }).distinct('templateId');

    await Comment.deleteMany({ $or: [{ authorId: user._id }, { rankingId: { $in: rankingIds } }] });
    await Like.deleteMany({ $or: [{ userId: user._id }, { rankingId: { $in: rankingIds } }] });
    // A removal notice someone got from this account as a moderator stays: it is about their content
    await Notification.deleteMany({
      $or: [
        { recipientId: user._id },
        { rankingId: { $in: rankingIds } },
        { actorId: user._id, type: { $ne: 'content_removed' } },
      ],
    });
    await Ranking.deleteMany({ _id: { $in: rankingIds } });
    await Item.deleteMany({ templateId: { $in: templateIds } });
    await Template.deleteMany({ _id: { $in: templateIds } });
    for (const templateId of rankedTemplateIds) await recountRankings(templateId);

    await AuthToken.deleteMany({ userId: user._id });
    await OAuthAccount.deleteMany({ userId: user._id });
    await user.deleteOne();
  });
}
