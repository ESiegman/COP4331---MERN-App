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

// Login, password reset and Google/Discord login: slows down password guessing, with room for
// a classroom of people logging in from one network
export const loginLimiter = limiter({ minutes: 15, limit: 100 });

// Routes that send an email (sign-up, resend verification, forgot password), so they can't be
// used to flood someone's inbox
export const emailLimiter = limiter({ minutes: 60, limit: 50 });

// AI item suggestions cost money per call
export const aiLimiter = limiter({ minutes: 60, limit: 20 });
