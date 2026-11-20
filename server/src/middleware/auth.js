import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';
import { banned, hasRole, roleOf } from '../lib/roles.js';
import { User } from '../models/index.js';

// Clients send the token from login as:  Authorization: Bearer <token>
async function readUserId(req) {
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  try {
    return await verifyToken(token);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

// The account behind a token is read on every request rather than trusted from the token, so
// a ban or a role change takes effect on the next request instead of when the token expires.
// Kept on an object so tests that run without a database can swap it out.
export const accounts = {
  find: (userId) => User.findById(userId).select('role bannedAt banReason').lean(),
};

// For routes guests can use. req.userId is the caller's id, or null for a guest. A banned or
// deleted account browses as a guest.
export async function optionalAuth(req, res, next) {
  const userId = await readUserId(req);
  const account = userId && (await accounts.find(userId));
  const active = Boolean(account && !account.bannedAt);
  req.userId = active ? userId : null;
  req.userRole = active ? roleOf(account) : null;
  next();
}

// For routes that need an account. Checks like "is this my ranking?" belong in the service,
// which has the document in hand.
export async function requireAuth(req, res, next) {
  req.userId = await readUserId(req);
  if (!req.userId) throw unauthorized();

  const account = await accounts.find(req.userId);
  if (!account) throw unauthorized('This account no longer exists');
  if (account.bannedAt) throw banned(account);
  req.userRole = roleOf(account);
  next();
}

// After requireAuth: requireRole('moderator') lets moderators and admins through
export const requireRole = (minimum) => (req, res, next) => {
  if (!hasRole(req.userRole, minimum)) {
    throw forbidden(minimum === 'admin' ? 'Only admins can do that' : 'Only moderators can do that');
  }
  next();
};
