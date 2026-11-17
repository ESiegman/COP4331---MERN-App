import mongoose from 'mongoose';
import { ROLES } from './enums.js';

const ACCOUNT_FIELDS = ['_id', 'username', 'email', 'emailVerified', 'role', 'displayName', 'bio', 'avatarUrl', 'notificationPrefs', 'createdAt'];
const PROFILE_FIELDS = ['_id', 'username', 'displayName', 'bio', 'avatarUrl', 'createdAt'];

const userSchema = new mongoose.Schema(
  {
    // Both stored lowercase: the unique indexes are case-sensitive, so 'Ada' and 'ada' would otherwise both fit
    username: { type: String, required: true, trim: true, lowercase: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    // null for accounts that only sign in with Google or Discord.
    // Left out of query results unless asked for with .select('+passwordHash')
    passwordHash: { type: String, default: null, select: false },
    emailVerified: { type: Boolean, required: true, default: false },
    // Accounts made before roles existed have none, which counts as 'user'
    role: { type: String, enum: ROLES, default: 'user' },
    // Set while the account is banned. Both stay unset otherwise.
    bannedAt: Date,
    banReason: { type: String, trim: true },
    // Optional text stays unset rather than null: the database validator rejects null for these three
    displayName: { type: String, trim: true },
    bio: { type: String, trim: true },
    avatarUrl: String,
    pushTokens: { type: [String], default: [] },
    notificationPrefs: {
      newComment: { type: Boolean, default: true },
      newRanking: { type: Boolean, default: true },
      newLike: { type: Boolean, default: false },
    },
  },
  { collection: 'users', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

function pick(doc, fields) {
  const plain = doc.toObject();
  return Object.fromEntries(fields.filter((field) => plain[field] !== undefined).map((field) => [field, plain[field]]));
}

// What the account's owner gets back
userSchema.methods.toAccount = function toAccount() {
  return pick(this, ACCOUNT_FIELDS);
};

// What everyone else gets
userSchema.methods.toPublicProfile = function toPublicProfile() {
  return pick(this, PROFILE_FIELDS);
};

// Safety net: a user document passed straight to res.json() never leaks these
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.pushTokens;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
