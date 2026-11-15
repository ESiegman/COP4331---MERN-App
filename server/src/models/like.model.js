import mongoose from 'mongoose';

// The database allows one like per user per ranking
const likeSchema = new mongoose.Schema(
  {
    rankingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ranking', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'likes', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const Like = mongoose.model('Like', likeSchema);
