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

// What the account's owner sees of it, in GET /users/me
oauthAccountSchema.methods.toLinkedAccount = function toLinkedAccount() {
  return { provider: this.provider, ...(this.email && { email: this.email }), linkedAt: this.linkedAt };
};

export const OAuthAccount = mongoose.model('OAuthAccount', oauthAccountSchema);
