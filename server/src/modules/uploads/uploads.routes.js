import express, { Router } from 'express';
import { MAX_BYTES, uploadDir } from '../../integrations/storage.js';
import { requireAuth } from '../../middleware/auth.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './uploads.controller.js';
import * as schemas from './uploads.schemas.js';

// Mounted at /api/uploads
const router = Router();

router.post('/sign', requireAuth, uploadLimiter, validate({ body: schemas.sign }), controller.signImageUpload);

// The raw image is the body, whatever its Content-Type says; the service checks it really is one
router.put(
  '/:ticket',
  express.raw({ type: () => true, limit: MAX_BYTES }),
  validate({ params: schemas.ticketParams }),
  controller.storeImageUpload,
);

// The images themselves. File names are random and never reused, so browsers may cache them for good.
router.use('/files', express.static(uploadDir, { index: false, dotfiles: 'deny', immutable: true, maxAge: '365d' }));

export default router;
