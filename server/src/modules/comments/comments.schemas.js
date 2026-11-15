import { z } from 'zod';
import { idParams, pageQuery, text } from '../../lib/schemas.js';

export const rankingParams = idParams('rankingId');
export const commentParams = idParams('commentId');
export const listQuery = pageQuery;

// Used for both writing and editing a comment
export const body = z.object({ body: text().trim().min(1).max(1000) });
