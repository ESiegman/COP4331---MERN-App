import { KEEP_UPDATED_AT, withTransaction } from '../../lib/db.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { findPage } from '../../lib/pagination.js';
import { isOwner } from '../../lib/sharedContent.js';
import { Comment, Ranking } from '../../models/index.js';
import { notify } from '../notifications/notifications.service.js';
import { findViewableRanking } from '../rankings/rankings.service.js';
import { findPublicProfiles } from '../users/users.service.js';

// Ranking.addComment and Comment.edit / delete from the class diagram.

const wrote = (comment, userId) => String(comment.authorId) === String(userId);

// The comment as the apps show it: with its author's public profile
async function withAuthor(comment) {
  const profiles = await findPublicProfiles([comment.authorId]);
  return { ...comment.toObject(), author: profiles.get(String(comment.authorId)) ?? null };
}

// Loads a comment together with the ranking it is on. If the user may not see the ranking,
// the comment answers 404 as well.
async function findComment(userId, commentId) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw notFound('Comment');

  const ranking = await findViewableRanking(userId, comment.rankingId);
  return { comment, ranking };
}

// GET /rankings/:rankingId/comments
// Oldest first, like a conversation, which is also the order of the { rankingId, createdAt } index.
export async function listComments(viewerId, rankingId, { cursor, limit }) {
  const ranking = await findViewableRanking(viewerId, rankingId);
  const page = await findPage(
    Comment,
    { rankingId: ranking._id },
    { sortBy: 'createdAt', ascending: true, cursor, limit },
  );

  const profiles = await findPublicProfiles(page.items.map((comment) => comment.authorId));
  const items = page.items.map((comment) => ({
    ...comment,
    author: profiles.get(String(comment.authorId)) ?? null,
  }));
  return { items, nextCursor: page.nextCursor };
}

// POST /rankings/:rankingId/comments  (Comment on ranking)
// The comment, the ranking's commentCount and the owner's notification are saved together.
export async function addComment(userId, rankingId, body) {
  const ranking = await findViewableRanking(userId, rankingId);
  if (!ranking.publishedAt) throw badRequest('Only published rankings can be commented on');

  const { comment, sendPush } = await withTransaction(async () => {
    const created = await Comment.create({ rankingId: ranking._id, authorId: userId, body });
    await Ranking.updateOne({ _id: ranking._id }, { $inc: { commentCount: 1 } }, KEEP_UPDATED_AT);
    return { comment: created, sendPush: await notify(ranking.ownerId, userId, 'new_comment', ranking._id) };
  });
  await sendPush();

  return withAuthor(comment);
}

// PATCH /comments/:commentId
// The ERD has no updatedAt on comments. Add one to db/setup.js and the model first if the
// apps should show "edited".
export async function editComment(userId, commentId, body) {
  const { comment } = await findComment(userId, commentId);
  if (!wrote(comment, userId)) throw forbidden('Only the author can edit this comment');

  comment.body = body;
  await comment.save();
  return withAuthor(comment);
}

// DELETE /comments/:commentId
// Allowed for the comment's author, and for the owner of the ranking it is on.
export async function deleteComment(userId, commentId) {
  const { comment, ranking } = await findComment(userId, commentId);
  if (!wrote(comment, userId) && !isOwner(ranking, userId)) {
    throw forbidden('Only the author or the ranking owner can delete this comment');
  }

  await withTransaction(async () => {
    // The count only goes down if this request is the one that removed the comment
    const { deletedCount } = await Comment.deleteOne({ _id: comment._id });
    if (deletedCount === 1) {
      await Ranking.updateOne({ _id: ranking._id }, { $inc: { commentCount: -1 } }, KEEP_UPDATED_AT);
    }
  });
}
