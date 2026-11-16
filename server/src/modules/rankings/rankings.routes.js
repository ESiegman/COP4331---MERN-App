import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { rankingCommentsRouter } from '../comments/comments.routes.js';
import * as controller from './rankings.controller.js';
import * as schemas from './rankings.schemas.js';

// Mounted at /api/rankings. Starting a ranking is POST /api/templates/:templateId/rankings.
const router = Router();
const params = schemas.rankingParams;

router.get('/', validate({ query: schemas.feedQuery }), controller.listFeed);

router.get('/:rankingId', optionalAuth, validate({ params }), controller.getRanking);
router.put('/:rankingId', requireAuth, validate({ params, body: schemas.save }), controller.saveRanking);
router.delete('/:rankingId', requireAuth, validate({ params }), controller.deleteRanking);

router.put('/:rankingId/like', requireAuth, validate({ params }), controller.like);
router.delete('/:rankingId/like', requireAuth, validate({ params }), controller.unlike);

router.use('/:rankingId/comments', rankingCommentsRouter);

export default router;
