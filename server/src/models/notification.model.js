import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from './enums.js';

// "actor did something (type) involving ranking", shown to recipient
const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    rankingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ranking', required: true },
    read: { type: Boolean, required: true, default: false },
  },
  { collection: 'notifications', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const Notification = mongoose.model('Notification', notificationSchema);
