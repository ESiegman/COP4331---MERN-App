import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from '../config/env.js';

// JSON lines in production, readable one-liners in development, silent in tests
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { ignore: 'pid,hostname,req,res,responseTime' } }
      : undefined,
});

const describe = (req, res) => `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode}`;

// Logs one line per request and adds req.log. Headers are left out so tokens never reach the logs.
export const httpLogger = pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/api/health' },
  customLogLevel: (req, res) => (res.statusCode >= 500 ? 'error' : 'info'),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
    // pino-http attaches a placeholder error to every 5xx response. Drop it: the error handler
    // logs the real error, stack included, for anything unexpected.
    err: (err) => (err.message?.startsWith('failed with status code') ? undefined : err),
  },
  customSuccessMessage: (req, res, responseTime) => `${describe(req, res)} ${Math.round(responseTime)}ms`,
  customErrorMessage: describe,
});
