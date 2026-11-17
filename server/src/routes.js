import { Router } from 'express';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import { commentsRouter } from './modules/comments/comments.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import rankingsRoutes from './modules/rankings/rankings.routes.js';
import templatesRoutes from './modules/templates/templates.routes.js';
import uploadsRoutes from './modules/uploads/uploads.routes.js';
import usersRoutes from './modules/users/users.routes.js';

// Everything here is served under /api (see app.js)
const router = Router();

// Used by the Docker healthcheck and the smoke test at the end of each deploy
router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/templates', templatesRoutes);
router.use('/rankings', rankingsRoutes);
router.use('/comments', commentsRouter);
router.use('/notifications', notificationsRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/admin', adminRoutes);

export default router;
