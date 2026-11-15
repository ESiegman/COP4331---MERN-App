import * as authService from './auth.service.js';

// Controllers stay thin: read the validated input from req.valid, call the service, shape the
// response. Anything thrown goes to the error handler.

export async function register(req, res) {
  await authService.register(req.valid.body);
  res.status(201).json({ message: 'Account created. Check your inbox to verify your email.' });
}

export async function verifyEmail(req, res) {
  const { token, user } = await authService.verifyEmail(req.valid.body.token);
  res.json({ token, user: user.toAccount() });
}

export async function resendVerification(req, res) {
  await authService.resendVerification(req.valid.body.email);
  res.status(202).json({ message: 'If that account still needs verifying, a new link is on its way.' });
}

export async function login(req, res) {
  const { token, user } = await authService.login(req.valid.body);
  res.json({ token, user: user.toAccount() });
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.valid.body.email);
  res.status(202).json({ message: 'If that email has an account, a reset link is on its way.' });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body);
  res.json({ message: 'Password updated. You can log in now.' });
}

export async function loginWithOAuth(req, res) {
  const { token, user } = await authService.loginWithOAuth(req.valid.params.provider, req.valid.body);
  res.json({ token, user: user.toAccount() });
}
