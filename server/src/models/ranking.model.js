import mongoose from 'mongoose';
import { VISIBILITIES } from './enums.js';

// Tiers are stored inside the ranking, so one read loads the whole board.
// Template items that appear in no tier are the unranked ones.
const tierSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    order: { type: Number, required: true },
    itemIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
  },
  { _id: false },
);

// One person's tier list for a template. The database allows one per person per template.
const rankingSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true },
    tiers: { type: [tierSchema], required: true },
    visibility: { type: String, enum: VISIBILITIES, required: true, default: 'public' },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    // null while the ranking is still a draft
    publishedAt: { type: Date, default: null },
  },
  { collection: 'rankings', versionKey: false, timestamps: true },
);

export const Ranking = mongoose.model('Ranking', rankingSchema);
