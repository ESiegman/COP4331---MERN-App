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

const item = z.object({
  name: text().trim().min(1).max(60),
  imageUrl: imageUrl.nullable().optional(),
});

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
export const updateItem = atLeastOneField(item.partial());

export const suggestItems = z.object({
  topic: text().trim().min(2).max(80),
  count: z.coerce.number().int().min(1).max(30).default(10),
});
