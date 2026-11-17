import { notFound, unauthorized } from '../../lib/errors.js';
import { OAuthAccount, User } from '../../models/index.js';

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
