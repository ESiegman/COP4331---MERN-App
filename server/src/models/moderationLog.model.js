import mongoose from 'mongoose';
import { MODERATION_ACTIONS } from './enums.js';

// One line of the moderation history: who did what to whose account or content, and why.
// actorId is unset for a role given with the setRole command on the server.
const moderationLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, enum: MODERATION_ACTIONS, required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The template, ranking or comment removed, kept even though it no longer exists
    contentId: mongoose.Schema.Types.ObjectId,
    // What it was: a title, the start of a comment, or "user to moderator"
    summary: { type: String, required: true },
    reason: String,
  },
  { collection: 'moderationlogs', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const ModerationLog = mongoose.model('ModerationLog', moderationLogSchema);
