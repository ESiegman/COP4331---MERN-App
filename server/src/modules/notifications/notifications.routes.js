import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './notifications.controller.js';
import * as schemas from './notifications.schemas.js';

// Mounted at /api/notifications. Everything here is about the caller's own notifications.
const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: schemas.listQuery }), controller.listNotifications);
router.post('/read-all', controller.markAllRead);
router.patch(
  '/:notificationId',
  validate({ params: schemas.notificationParams, body: schemas.markRead }),
  controller.markRead,
);

export default router;
