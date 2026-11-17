import { z } from 'zod';
import { pageQuery, reasonBody } from '../../lib/schemas.js';
import { ROLES } from '../../models/enums.js';

export { usernameParams } from '../users/users.schemas.js';

export const ban = reasonBody;
export const role = z.object({ role: z.enum(ROLES, { error: 'must be user, moderator or admin' }) });
export const userList = pageQuery.extend({
  status: z.enum(['staff', 'banned'], { error: 'must be staff or banned' }),
});
export const logQuery = pageQuery;
