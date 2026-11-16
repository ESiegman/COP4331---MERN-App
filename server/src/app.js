import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { httpLogger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import routes from './routes.js';

// Builds the Express app without starting it, so tests can drive it directly
export function createApp() {
  const app = express();

  // In production Caddy sits in front, so the real client address is one proxy hop away
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

  app.use(helmet());
  app.use(httpLogger);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
