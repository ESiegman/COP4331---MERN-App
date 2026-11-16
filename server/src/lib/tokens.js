import { createHash, randomBytes } from 'node:crypto';

// One-time tokens for email verification and password reset links.
// The link carries the token; the database only stores its hash, so a leaked
// authtokens collection cannot be used to verify or reset anyone.
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function createToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export const hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);
