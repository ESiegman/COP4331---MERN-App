import { z } from 'zod';

// POST /uploads/sign: what the image is for, and its type
export const sign = z.object({
  kind: z.enum(['item', 'avatar', 'cover']),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
