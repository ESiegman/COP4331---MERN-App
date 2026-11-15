import mongoose from 'mongoose';
import { DEFAULT_TIER_LABELS, VISIBILITIES } from './enums.js';

// The thing being ranked, for example "Gas station snacks". Its items live in the items collection.
const templateSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    // Optional text stays unset rather than null: the database validator rejects null for these two
    description: { type: String, trim: true },
    category: { type: String, trim: true, lowercase: true },
    coverImageUrl: { type: String, default: null },
    tierLabels: { type: [String], default: () => [...DEFAULT_TIER_LABELS] },
    visibility: { type: String, enum: VISIBILITIES, required: true, default: 'public' },
    // Number of published rankings. Bumped the first time a ranking is published.
    rankingCount: { type: Number, default: 0, min: 0 },
  },
  { collection: 'templates', versionKey: false, timestamps: true },
);

export const Template = mongoose.model('Template', templateSchema);
