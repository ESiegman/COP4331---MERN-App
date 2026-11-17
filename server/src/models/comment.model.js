import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    rankingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ranking', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
  },
  // updatedAt starts equal to createdAt and moves when the author edits the comment
  { collection: 'comments', versionKey: false, timestamps: true },
);

export const Comment = mongoose.model('Comment', commentSchema);
