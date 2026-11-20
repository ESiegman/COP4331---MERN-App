import { z } from 'zod';
import { text } from '../../lib/schemas.js';
import { OAUTH_PROVIDERS } from '../../models/enums.js';

// Names that would mislead people
export const RESERVED_USERNAMES = new Set(['admin', 'api', 'support', 'system']);

// Lowercased before checking, so 'Ada' and 'ada' are the same username.
// The 3-character minimum also keeps "me" free for the /users/me routes.
export const username = text()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, 'must be 3-20 letters, numbers or underscores')
  .refine((name) => !RESERVED_USERNAMES.has(name), 'is not available');

export const email = text().trim().toLowerCase().pipe(z.email('must be a valid email address'));

// bcrypt ignores everything after 72 bytes, so longer passwords are refused instead of silently cut
const password = text()
  .min(8, 'must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value) <= 72, 'must be at most 72 characters');

const token = text().min(1, 'is required');

export const register = z.object({ username, email, password });
export const login = z.object({ email, password: text().min(1, 'is required') });
export const verifyEmail = z.object({ token });
export const emailOnly = z.object({ email });
export const resetPassword = z.object({ token, password });

// What the client hands over after the Google or Discord sign-in screen
export const providerParams = z.object({ provider: z.enum(OAUTH_PROVIDERS) });
export const oauthCode = z.object({
  code: text().min(1, 'is required'),
  codeVerifier: text().min(1, 'is required'),
  redirectUri: z.url(),
});
