import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

// EmailService from the class diagram.

// Messages "sent" while tests run, so a test can read the link out of an email
export const outbox = [];

// TODO: choose an email provider and send the message here with fetch().
// Until then nothing leaves the server: in development the message, link included, is written to
// the API log so sign-up can be tried locally. In production it is dropped, because a
// verification or reset link must never sit in the logs.
async function send(message) {
  if (env.NODE_ENV === 'test') {
    outbox.push(message);
  } else if (env.NODE_ENV === 'development') {
    logger.info({ email: message }, `Email to ${message.to} (not sent, no provider configured)`);
  } else {
    logger.error(`Email "${message.subject}" dropped: no email provider configured`);
  }
}

export const sendVerificationEmail = (user, link) =>
  send({
    to: user.email,
    subject: 'Verify your email',
    text: `Hi ${user.username}, confirm your email to finish signing up:\n${link}\nThe link works for 24 hours.`,
  });

export const sendPasswordResetEmail = (user, link) =>
  send({
    to: user.email,
    subject: 'Reset your password',
    text: `Hi ${user.username}, choose a new password here:\n${link}\nThe link works for 1 hour. If you did not ask for this, ignore this email.`,
  });
