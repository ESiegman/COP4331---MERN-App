import { z } from 'zod';
import { VISIBILITIES } from '../models/enums.js';

// Zod building blocks shared by the modules' *.schemas.js files

// Friendlier messages than Zod's defaults, for a missing field, a field that isn't text, and
// length limits. A check that gives its own message, like .regex(pattern, 'letters only'),
// keeps it; anything else falls back to Zod's message.
function textError(issue) {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? 'is required' : 'must be text';
    case 'too_small':
      return issue.minimum <= 1 ? 'cannot be empty' : `must be at least ${issue.minimum} characters`;
    case 'too_big':
      return `must be at most ${issue.maximum} characters`;
    default:
      return undefined;
  }
}

// A string field. Missing, wrong type and length errors all read well when shown to users.
export const text = () => z.string({ error: textError });

export const objectId = text().regex(/^[0-9a-f]{24}$/i, 'must be a 24-character id');

// idParams('templateId', 'itemId') validates /:templateId/items/:itemId
export const idParams = (...names) =>
  z.object(Object.fromEntries(names.map((name) => [name, objectId])));

// ?cursor=...&limit=20 on every list endpoint
export const pageQuery = z.object({
  cursor: text().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const visibility = z.enum(VISIBILITIES);

export const imageUrl = z.url({ protocol: /^https$/, error: 'must be an https URL' }).max(2000);

// For PATCH bodies, where every field is optional but an empty body is a mistake
export const atLeastOneField = (schema) =>
  schema.refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');
