import { z } from 'zod';
import { idParams, pageQuery } from '../../lib/schemas.js';

export const notificationParams = idParams('notificationId');

// GET /notifications?unread=true
export const listQuery = pageQuery.extend({
  unread: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

// PATCH /notifications/:notificationId. Notifications are only ever marked read, never unread.
export const markRead = z.object({ read: z.literal(true) });
