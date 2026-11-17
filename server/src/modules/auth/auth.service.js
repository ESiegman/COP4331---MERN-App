import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../../integrations/email.js';
import { exchangeCode, providerName } from '../../integrations/oauth.js';
import { withTransaction } from '../../lib/db.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { signToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { createToken, hashToken, hoursFromNow } from '../../lib/tokens.js';
import { AuthToken, OAuthAccount, User } from '../../models/index.js';
import { RESERVED_USERNAMES } from './auth.schemas.js';

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

// --- Log in with Google or Discord

const MAX_DISPLAY_NAME = 50;

// "Ada Lovelace" -> "ada_lovelace". Short enough to leave room for a number on the end.
function toUsername(text = '') {
  const name = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 15)
    .replace(/^_+|_+$/g, '');
  return name.length >= 3 ? name : null;
}

// A username nobody has yet, made from the person's name or else their email
async function freeUsername({ name, email }) {
  const base = toUsername(name) ?? toUsername(email.split('@')[0]) ?? 'user';
  const candidates = [base, ...Array.from({ length: 8 }, () => `${base}${randomInt(10, 10_000)}`)];
  for (const candidate of candidates) {
    if (!RESERVED_USERNAMES.has(candidate) && !(await User.exists({ username: candidate }))) return candidate;
  }
  return `${base.slice(0, 12)}${randomBytes(4).toString('hex')}`;
}

// Two first logins with the same new Google account at once both try to create it. The unique
// indexes stop the second; trying again finds what the first one made.
async function retryOnDuplicate(fn, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err?.code !== 11000 || attempt === attempts) throw err;
    }
  }
}

async function findOrCreateOAuthUser(provider, identity) {
  const { providerUserId, email, emailVerified } = identity;
  const name = providerName(provider);

  const linked = await OAuthAccount.findOne({ provider, providerUserId });
  if (linked) {
    const user = await User.findById(linked.userId);
    if (user) return user;
    await linked.deleteOne(); // its user was deleted: start over as a new person
  }

  // Matching or creating an account by email is only safe when the provider checked the address
  if (!emailVerified) {
    throw forbidden(
      `Your ${name} account has no verified email address. Verify one with ${name}, or use your email and password instead.`,
      'OAUTH_EMAIL_UNVERIFIED',
    );
  }

  return withTransaction(async () => {
    let user = await User.findOne({ email });
    if (user) {
      if (await OAuthAccount.exists({ userId: user._id, provider })) {
        throw conflict(`The account for ${email} is linked to a different ${name} account`);
      }
      if (!user.emailVerified) {
        // Whoever registered this address never proved it was theirs, and the provider just proved
        // it belongs to this person. Their password can't be trusted, so it goes, along with
        // the pending verification link.
        await User.updateOne({ _id: user._id }, { passwordHash: null, emailVerified: true });
        await AuthToken.deleteMany({ userId: user._id, type: 'verify_email' });
        user.emailVerified = true;
      }
    } else {
      const displayName = identity.name?.trim().slice(0, MAX_DISPLAY_NAME) || undefined;
      const avatarUrl = identity.avatarUrl?.startsWith('https://') ? identity.avatarUrl : undefined;
      user = await User.create({ username: await freeUsername(identity), email, emailVerified: true, displayName, avatarUrl });
    }
    await OAuthAccount.create({ userId: user._id, provider, providerUserId, email });
    return user;
  });
}

/**
 * POST /auth/oauth/:provider  (Log in with Google, Log in with Discord)
 *
 * 1. The provider's account is already linked: log its user in.
 * 2. Otherwise the provider's verified email matches a user: link it to them and log in.
 * 3. Otherwise create the user (no password, email verified, a username made from their name)
 *    together with the link.
 * Returns { token, user }, the same as login().
 */
export async function loginWithOAuth(provider, input) {
  const identity = await exchangeCode(provider, input);
  const user = await retryOnDuplicate(() => findOrCreateOAuthUser(provider, identity));
  return { token: await signToken(user._id), user };
}

/**
 * POST /users/me/oauth/:provider  (link Google or Discord to the account that is logged in)
 *
 * The provider's email doesn't have to match the account's. One Google and one Discord account
 * per user, and each can belong to only one user. Returns the new link.
 */
export async function linkAccount(userId, provider, input) {
  const identity = await exchangeCode(provider, input);
  const name = providerName(provider);

  if (!(await User.exists({ _id: userId }))) throw unauthorized('This account no longer exists');

  const existing = await OAuthAccount.findOne({ provider, providerUserId: identity.providerUserId });
  if (existing) {
    throw conflict(
      existing.userId.equals(userId)
        ? `This ${name} account is already linked to you`
        : `This ${name} account is linked to a different user`,
    );
  }
  if (await OAuthAccount.exists({ userId, provider })) {
    throw conflict(`You already have a ${name} account linked. Unlink it first.`);
  }

  try {
    const account = await OAuthAccount.create({ userId, provider, providerUserId: identity.providerUserId, email: identity.email });
    return account.toLinkedAccount();
  } catch (err) {
    if (err?.code === 11000) throw conflict(`That ${name} account was just linked by another request`);
    throw err;
  }
}

/**
 * DELETE /users/me/oauth/:provider
 *
 * Refused while it is the only way in: no password and no other linked account.
 * (Forgot password still works for such an account, and sets a password.)
 */
export async function unlinkAccount(userId, provider) {
  const name = providerName(provider);
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw unauthorized('This account no longer exists');

  const account = await OAuthAccount.findOne({ userId, provider });
  if (!account) throw notFound(`Linked ${name} account`);

  if (!user.passwordHash && !(await OAuthAccount.exists({ userId, provider: { $ne: provider } }))) {
    throw conflict(`${name} is the only way into this account. Set a password with "Forgot password" first.`);
  }
  await account.deleteOne();
}
