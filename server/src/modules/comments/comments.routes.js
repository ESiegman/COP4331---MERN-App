import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './comments.controller.js';
import * as schemas from './comments.schemas.js';

// Mounted at /api/rankings/:rankingId/comments by the rankings router.
// mergeParams lets these routes see :rankingId from the parent path.
export const rankingCommentsRouter = Router({ mergeParams: true });

rankingCommentsRouter.get(
  '/',
  optionalAuth,
  validate({ params: schemas.rankingParams, query: schemas.listQuery }),
  controller.listComments,
);
rankingCommentsRouter.post(
  '/',
  requireAuth,
  validate({ params: schemas.rankingParams, body: schemas.body }),
  controller.addComment,
);

// Mounted at /api/comments
export const commentsRouter = Router();

commentsRouter.patch(
  '/:commentId',
  requireAuth,
  validate({ params: schemas.commentParams, body: schemas.body }),
  controller.editComment,
);
commentsRouter.delete('/:commentId', requireAuth, validate({ params: schemas.commentParams }), controller.deleteComment);
