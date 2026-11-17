import mongoose from 'mongoose';
import { NOTIFICATION_TYPES, REMOVED_KINDS } from './enums.js';

// "actor did something (type) involving ranking", shown to recipient. A content_removed
// notification says a moderator removed something of theirs: what it was is in `removed`, and
// rankingId is only set for a comment, to the ranking it was on.
const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    rankingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ranking' },
    removed: {
      type: new mongoose.Schema(
        {
          kind: { type: String, enum: REMOVED_KINDS, required: true },
          title: { type: String, required: true },
          reason: String,
        },
        { _id: false },
      ),
      default: undefined,
    },
    read: { type: Boolean, required: true, default: false },
  },
  { collection: 'notifications', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const Notification = mongoose.model('Notification', notificationSchema);
