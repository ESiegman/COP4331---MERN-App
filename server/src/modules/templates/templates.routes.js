import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { pageQuery } from '../../lib/schemas.js';
import * as rankings from '../rankings/rankings.controller.js';
import * as controller from './templates.controller.js';
import * as schemas from './templates.schemas.js';

// Mounted at /api/templates
const router = Router();
const params = schemas.templateParams;

router.get('/', validate({ query: schemas.listQuery }), controller.listTemplates);
router.post('/', requireAuth, validate({ body: schemas.create }), controller.createTemplate);
router.post('/suggest-items', requireAuth, aiLimiter, validate({ body: schemas.suggestItems }), controller.suggestItems);

router.get('/:templateId', optionalAuth, validate({ params }), controller.getTemplate);
router.patch('/:templateId', requireAuth, validate({ params, body: schemas.update }), controller.updateTemplate);
router.delete('/:templateId', requireAuth, validate({ params }), controller.deleteTemplate);

router.post('/:templateId/items', requireAuth, validate({ params, body: schemas.addItem }), controller.addItem);
router.patch(
  '/:templateId/items/:itemId',
  requireAuth,
  validate({ params: schemas.itemParams, body: schemas.updateItem }),
  controller.updateItem,
);
router.delete('/:templateId/items/:itemId', requireAuth, validate({ params: schemas.itemParams }), controller.removeItem);

// Rankings of one template. The handlers live in the rankings module.
router.get('/:templateId/rankings', optionalAuth, validate({ params, query: pageQuery }), rankings.listForTemplate);
router.post('/:templateId/rankings', requireAuth, validate({ params }), rankings.startRanking);
router.get('/:templateId/community-ranking', optionalAuth, validate({ params }), rankings.communityRanking);

export default router;
