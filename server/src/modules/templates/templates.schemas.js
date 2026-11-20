import { z } from 'zod';
import { atLeastOneField, idParams, imageUrl, pageQuery, text, visibility } from '../../lib/schemas.js';

const fields = {
  title: text().trim().min(1).max(100),
  description: text().trim().max(500),
  category: text().trim().toLowerCase().max(40),
  coverImageUrl: imageUrl.nullable(),
  tierLabels: z.array(text().trim().min(1).max(20)).min(1).max(12),
  visibility,
};

const itemFields = z.object({
  name: text().trim().min(1).max(60),
  imageUrl: imageUrl.nullable().optional(),
  // Describes the picture for people who can't see it. An item can also be text only (no imageUrl).
  altText: text().trim().min(1).max(200).nullable().optional(),
});

// A picture needs a description: the accessibility rule for every item that has one
const describePicture = (value) => !value.imageUrl || Boolean(value.altText);
const describePictureError = { message: 'is required when the item has a picture', path: ['altText'] };

const item = itemFields.refine(describePicture, describePictureError);

export const templateParams = idParams('templateId');
export const itemParams = idParams('templateId', 'itemId');

// GET /templates?q=snacks&category=food&sort=popular
export const listQuery = pageQuery.extend({
  q: text().trim().min(1).max(100).optional(),
  category: fields.category.optional(),
  sort: z.enum(['new', 'popular']).default('new'),
});

// POST /templates: the template and its starting items in one request
export const create = z.object({
  title: fields.title,
  description: fields.description.optional(),
  category: fields.category.optional(),
  coverImageUrl: fields.coverImageUrl.optional(),
  tierLabels: fields.tierLabels.optional(),
  visibility: fields.visibility.default('public'),
  items: z.array(item).max(200).default([]),
});

export const update = atLeastOneField(z.object(fields).partial());

export const addItem = item;
export const updateItem = atLeastOneField(itemFields.partial()).refine(describePicture, describePictureError);

export const suggestItems = z.object({
  topic: text().trim().min(2).max(80),
  count: z.coerce.number().int().min(1).max(30).default(10),
});
