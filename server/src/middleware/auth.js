import { unauthorized } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

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

// For routes guests can use. req.userId is the caller's id, or null for a guest.
export async function optionalAuth(req, res, next) {
  req.userId = await readUserId(req);
  next();
}

// For routes that need an account. Checks like "is this my ranking?" belong in the service,
// which has the document in hand.
export async function requireAuth(req, res, next) {
  req.userId = await readUserId(req);
  if (!req.userId) throw unauthorized();
  next();
}
