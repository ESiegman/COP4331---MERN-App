import { z } from 'zod';
import { idParams, objectId, pageQuery, text, visibility } from '../../lib/schemas.js';

export const rankingParams = idParams('rankingId');

// GET /rankings?sort=top
export const feedQuery = pageQuery.extend({ sort: z.enum(['new', 'top']).default('new') });

const tier = z.object({
  label: text().trim().min(1).max(20),
  color: text().regex(/^#[0-9a-f]{6}$/i, 'must be a hex color like #ff7f7f'),
  itemIds: z.array(objectId).max(500),
});

// Tiers arrive top to bottom, and the service stores each one's position as its `order`,
// so clients never send order and two tiers can never share one.
const tiers = z
  .array(tier)
  .min(1)
  .max(12)
  .refine((list) => {
    const ids = list.flatMap((entry) => entry.itemIds.map((id) => id.toLowerCase()));
    return new Set(ids).size === ids.length;
  }, 'an item can only be in one tier');

// PUT /rankings/:rankingId replaces the whole board. publish: true makes a draft public
// for the first time; leave it out to autosave while dragging.
export const save = z.object({
  title: text().trim().max(100).optional(),
  tiers,
  visibility,
  publish: z.boolean().default(false),
});
