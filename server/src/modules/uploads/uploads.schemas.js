import { z } from 'zod';
import { UPLOAD_KINDS } from '../../integrations/storage.js';

// POST /uploads/sign: what the image is for, and its type
export const sign = z.object({
  kind: z.enum(UPLOAD_KINDS),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

// PUT /uploads/:ticket
export const ticketParams = z.object({ ticket: z.string().min(1).max(2000) });
