import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

// Counts requests per client address in memory, which is enough for a single API container
const limiter = ({ minutes, limit }) =>
  rateLimit({
    windowMs: minutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    message: { error: 'Too many requests, try again later', code: 'RATE_LIMITED' },
  });

// Sign-up, login and password reset: slows down password guessing
export const authLimiter = limiter({ minutes: 15, limit: 30 });

// AI item suggestions cost money per call
export const aiLimiter = limiter({ minutes: 60, limit: 20 });
