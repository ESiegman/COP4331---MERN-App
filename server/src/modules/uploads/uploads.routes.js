import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './uploads.controller.js';
import * as schemas from './uploads.schemas.js';

// Mounted at /api/uploads
const router = Router();

router.post('/sign', requireAuth, validate({ body: schemas.sign }), controller.signImageUpload);

export default router;
