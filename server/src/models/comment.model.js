import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    rankingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ranking', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
  },
  { collection: 'comments', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const Comment = mongoose.model('Comment', commentSchema);
