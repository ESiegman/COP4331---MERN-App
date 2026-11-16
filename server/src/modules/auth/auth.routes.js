import { Router } from 'express';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import * as schemas from './auth.schemas.js';

// Mounted at /api/auth. None of these need a token.
const router = Router();

router.use(authLimiter);

router.post('/register', validate({ body: schemas.register }), controller.register);
router.post('/verify-email', validate({ body: schemas.verifyEmail }), controller.verifyEmail);
router.post('/resend-verification', validate({ body: schemas.emailOnly }), controller.resendVerification);
router.post('/login', validate({ body: schemas.login }), controller.login);
router.post('/forgot-password', validate({ body: schemas.emailOnly }), controller.forgotPassword);
router.post('/reset-password', validate({ body: schemas.resetPassword }), controller.resetPassword);
router.post(
  '/oauth/:provider',
  validate({ params: schemas.providerParams, body: schemas.oauthCode }),
  controller.loginWithOAuth,
);

export default router;
