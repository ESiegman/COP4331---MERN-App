import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { aiConfigured } from './integrations/ai.js';
import { emailConfigured } from './integrations/email.js';
import { listProviders, oauthProviders } from './integrations/oauth.js';

// A failed connection rejects here, which stops the process with the error and exit code 1
await connectDb();
logger.info('Connected to MongoDB');

if (env.NODE_ENV === 'production' && !emailConfigured) {
  logger.warn('SMTP_URL is not set: verification and password reset emails will not be sent');
}
if (env.NODE_ENV === 'production' && !aiConfigured) {
  logger.warn('ANTHROPIC_API_KEY is not set: AI item suggestions answer 501');
}
if (env.NODE_ENV === 'production') {
  const ready = new Set(listProviders().map(({ provider }) => provider));
  for (const [id, { name }] of Object.entries(oauthProviders)) {
    const prefix = id.toUpperCase();
    if (!ready.has(id)) logger.warn(`${prefix}_CLIENT_ID or ${prefix}_CLIENT_SECRET is not set: ${name} login answers 501`);
  }
}

const server = createApp().listen(env.PORT, (err) => {
  if (err) throw err;
  logger.info(`API listening on port ${env.PORT}`);
});

// Docker sends SIGTERM on every deploy: finish the requests in flight, then close the database
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}
