import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

// EmailService from the class diagram.
//
// With SMTP_URL set, email goes out through that SMTP server, so any provider works (Resend,
// Brevo, Mailgun, Amazon SES, Gmail, ...). Without it nothing leaves the server: in development
// the message, link included, is written to the API log so sign-up can be tried locally; in
// production it is dropped, because a verification or reset link must never sit in the logs.

// Messages "sent" while tests run, so a test can read the link out of an email
export const outbox = [];

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;
const from = env.EMAIL_FROM ?? `Tier List <no-reply@${new URL(env.APP_URL).hostname}>`;

export const emailConfigured = Boolean(transport);

async function send(message) {
  if (env.NODE_ENV === 'test') {
    outbox.push(message);
  } else if (transport) {
    await transport.sendMail({ from, ...message });
  } else if (env.NODE_ENV === 'development') {
    logger.info({ email: message }, `Email to ${message.to} (not sent: SMTP_URL is not set)`);
  } else {
    logger.error(`Email "${message.subject}" dropped: SMTP_URL is not set`);
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
