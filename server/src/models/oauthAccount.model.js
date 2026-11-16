import mongoose from 'mongoose';
import { OAUTH_PROVIDERS } from './enums.js';

// One Google or Discord login linked to a user. A user can have one of each.
const oauthAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: OAUTH_PROVIDERS, required: true },
    providerUserId: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    linkedAt: { type: Date, default: Date.now },
  },
  { collection: 'oauthaccounts', versionKey: false },
);

export const OAuthAccount = mongoose.model('OAuthAccount', oauthAccountSchema);
