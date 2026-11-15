import mongoose from 'mongoose';

// One thing to rank inside a template. Rankings point at items by id from their tiers.
const itemSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: null },
  },
  { collection: 'items', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const Item = mongoose.model('Item', itemSchema);
