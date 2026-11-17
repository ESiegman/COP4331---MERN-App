import { Router } from 'express';
import { emailLimiter, loginLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import * as schemas from './auth.schemas.js';

// Mounted at /api/auth. None of these need a token. verify-email has no limit: its token is
// random and long, so there is nothing to guess.
const router = Router();

router.post('/register', emailLimiter, validate({ body: schemas.register }), controller.register);
router.post('/verify-email', validate({ body: schemas.verifyEmail }), controller.verifyEmail);
router.post('/resend-verification', emailLimiter, validate({ body: schemas.emailOnly }), controller.resendVerification);
router.post('/login', loginLimiter, validate({ body: schemas.login }), controller.login);
router.post('/forgot-password', emailLimiter, validate({ body: schemas.emailOnly }), controller.forgotPassword);
router.post('/reset-password', loginLimiter, validate({ body: schemas.resetPassword }), controller.resetPassword);
router.get('/oauth/providers', controller.listOAuthProviders);
router.post(
  '/oauth/:provider',
  loginLimiter,
  validate({ params: schemas.providerParams, body: schemas.oauthCode }),
  controller.loginWithOAuth,
);

export default router;
