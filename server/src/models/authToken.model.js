import mongoose from 'mongoose';
import { AUTH_TOKEN_TYPES } from './enums.js';

// A one-time token behind an email verification or password reset link (see lib/tokens.js).
// MongoDB deletes these on its own once expiresAt has passed (TTL index in db/setup.js).
const authTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { collection: 'authtokens', versionKey: false },
);

export const AuthToken = mongoose.model('AuthToken', authTokenSchema);
