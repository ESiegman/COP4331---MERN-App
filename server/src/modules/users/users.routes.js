import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { oauthCode, providerParams } from '../auth/auth.schemas.js';
import * as controller from './users.controller.js';
import * as schemas from './users.schemas.js';

// Mounted at /api/users
const router = Router();

// The caller's own account. These come first so "me" is never read as a username.
router.get('/me', requireAuth, controller.getAccount);
router.patch('/me', requireAuth, validate({ body: schemas.updateAccount }), controller.updateAccount);
router.delete('/me', requireAuth, validate({ body: schemas.deleteAccount }), controller.deleteAccount);
router.post('/me/push-tokens', requireAuth, validate({ body: schemas.pushToken }), controller.addPushToken);
router.delete('/me/push-tokens', requireAuth, validate({ body: schemas.pushToken }), controller.removePushToken);
router.post(
  '/me/oauth/:provider',
  requireAuth,
  validate({ params: providerParams, body: oauthCode }),
  controller.linkOAuthAccount,
);
router.delete('/me/oauth/:provider', requireAuth, validate({ params: providerParams }), controller.unlinkOAuthAccount);

// Public profiles
router.get('/:username', validate({ params: schemas.usernameParams }), controller.getProfile);
router.get(
  '/:username/templates',
  optionalAuth,
  validate({ params: schemas.usernameParams, query: schemas.listQuery }),
  controller.listTemplates,
);
router.get(
  '/:username/rankings',
  optionalAuth,
  validate({ params: schemas.usernameParams, query: schemas.listQuery }),
  controller.listRankings,
);

export default router;
