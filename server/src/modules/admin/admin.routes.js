import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './admin.controller.js';
import * as schemas from './admin.schemas.js';

// Mounted at /api/admin. Moderators remove content through the normal DELETE routes; these are
// the rest. Roles are checked against the database on every request (see middleware/auth.js).
const router = Router();
const params = schemas.usernameParams;

router.use(requireAuth);

router.get('/users', requireRole('moderator'), validate({ query: schemas.userList }), controller.listUsers);
router.post('/users/:username/ban', requireRole('moderator'), validate({ params, body: schemas.ban }), controller.ban);
router.delete('/users/:username/ban', requireRole('moderator'), validate({ params }), controller.unban);
router.put('/users/:username/role', requireRole('admin'), validate({ params, body: schemas.role }), controller.setRole);
router.get('/log', requireRole('admin'), validate({ query: schemas.logQuery }), controller.listLog);

export default router;
