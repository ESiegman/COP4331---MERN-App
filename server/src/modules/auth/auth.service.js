import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../../integrations/email.js';
import { withTransaction } from '../../lib/db.js';
import { badRequest, conflict, forbidden, notImplemented, unauthorized } from '../../lib/errors.js';
import { signToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { createToken, hashToken, hoursFromNow } from '../../lib/tokens.js';
import { AuthToken, User } from '../../models/index.js';

// AuthService from the class diagram. The sign-up flow follows the "Sign up and verify email"
// sequence diagram step by step.

const BCRYPT_ROUNDS = 10;
const VERIFY_LINK_HOURS = 24;
const RESET_LINK_HOURS = 1;

// The web app owns these pages. Each one reads ?token= and posts it back to the API.
const linkTo = (path, token) => `${env.APP_URL}${path}?token=${token}`;

// Saves a new one-time token for the user and returns the raw value for the email link.
// Earlier tokens of the same type are removed, so only the newest link works.
async function issueToken(userId, type, hours) {
  const { token, tokenHash } = createToken();
  await AuthToken.deleteMany({ userId, type });
  await AuthToken.create({ userId, type, tokenHash, expiresAt: hoursFromNow(hours) });
  return token;
}

// Marks a token as used and returns its record. Finding and marking happen in one database
// step, so the same link cannot be redeemed twice even by two requests at once.
async function redeemToken(token, type) {
  const record = await AuthToken.findOneAndUpdate(
    { tokenHash: hashToken(token), type, usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
  );
  if (!record) throw badRequest('This link is invalid or has expired');
  return record;
}

// By the time an email goes out the account or token is already saved, so a failing email
// provider must not fail the request. The user can ask for another link.
async function deliver(send) {
  try {
    await send();
  } catch (err) {
    logger.error({ err }, 'Could not send email');
  }
}

// POST /auth/register
export async function register({ username, email, password }) {
  const existing = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (existing) {
    throw conflict(existing.email === email ? 'Email already in use' : 'Username already taken');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // The user and their verification token are saved together or not at all
  const { user, token } = await withTransaction(async () => {
    const created = await User.create({ username, email, passwordHash });
    return { user: created, token: await issueToken(created._id, 'verify_email', VERIFY_LINK_HOURS) };
  });

  await deliver(() => sendVerificationEmail(user, linkTo('/verify-email', token)));
  return user;
}

// POST /auth/verify-email
export async function verifyEmail(token) {
  const user = await withTransaction(async () => {
    const { userId } = await redeemToken(token, 'verify_email');
    return User.findByIdAndUpdate(userId, { emailVerified: true }, { returnDocument: 'after' });
  });
  if (!user) throw badRequest('This link is invalid or has expired');

  return { token: await signToken(user._id), user };
}

// POST /auth/resend-verification. Quietly does nothing for unknown or already verified
// addresses, so the response never reveals which emails have accounts.
export async function resendVerification(email) {
  const user = await User.findOne({ email, emailVerified: false });
  if (!user) return;

  const token = await issueToken(user._id, 'verify_email', VERIFY_LINK_HOURS);
  await deliver(() => sendVerificationEmail(user, linkTo('/verify-email', token)));
}

// POST /auth/login
export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');

  // One answer for an unknown email, a wrong password and a Google/Discord-only account
  const matches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!matches) throw unauthorized('Invalid email or password');

  if (!user.emailVerified) {
    throw forbidden('Verify your email before logging in', 'EMAIL_NOT_VERIFIED');
  }
  return { token: await signToken(user._id), user };
}

// POST /auth/forgot-password. Quietly does nothing for unknown addresses, as above.
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user) return;

  const token = await issueToken(user._id, 'reset_password', RESET_LINK_HOURS);
  await deliver(() => sendPasswordResetEmail(user, linkTo('/reset-password', token)));
}

// POST /auth/reset-password
export async function resetPassword({ token, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await withTransaction(async () => {
    const { userId } = await redeemToken(token, 'reset_password');
    // Opening the emailed link proves the address is theirs, so it counts as verifying it too
    await User.updateOne({ _id: userId }, { passwordHash, emailVerified: true });
  });
}

/**
 * POST /auth/oauth/:provider  (Log in with Google, Log in with Discord)
 *
 * TODO:
 * 1. integrations/oauth.exchangeCode(provider, input) gives
 *    { providerUserId, email, emailVerified, name, avatarUrl }.
 * 2. An OAuthAccount with that (provider, providerUserId) exists: log its user in.
 * 3. Otherwise, a User with that email exists: link the account to them, but only when the
 *    provider says the email is verified. If not, answer 409 and ask them to log in first.
 * 4. Otherwise create the User (passwordHash null, emailVerified true, a free username made
 *    from the name) and the OAuthAccount inside one withTransaction().
 * Returns { token, user }, the same as login().
 */
export async function loginWithOAuth(provider, input) {
  throw notImplemented('auth.loginWithOAuth');
}

/**
 * POST /users/me/oauth/:provider  (link Google or Discord to the account that is logged in)
 *
 * TODO: exchangeCode() as above, then create the OAuthAccount for userId.
 * 409 if that provider account is linked to someone else, or the user already has one for
 * this provider (the class diagram allows one Google and one Discord account per user).
 * Returns the new OAuthAccount.
 */
export async function linkAccount(userId, provider, input) {
  throw notImplemented('auth.linkAccount');
}

/**
 * DELETE /users/me/oauth/:provider
 *
 * TODO: delete the user's OAuthAccount for the provider. Refuse with 409 when it is their only
 * way in: no passwordHash and no other linked account.
 */
export async function unlinkAccount(userId, provider) {
  throw notImplemented('auth.unlinkAccount');
}
