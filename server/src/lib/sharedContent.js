import { env } from '../config/env.js';

// SharedContent from the class diagram: the rules templates and rankings have in common.
// Both have an ownerId and a visibility.

export const isOwner = (content, userId) =>
  userId != null && String(content.ownerId) === String(userId);

// Public and unlisted content opens for anyone who has its id; private content only for its
// owner. Unlisted differs from public only in staying out of lists, feeds and search.
export const canView = (content, viewerId) =>
  content.visibility !== 'private' || isOwner(content, viewerId);

// The link people share. These paths must match the web app's routes.
export const shareUrl = (kind, id) => `${env.APP_URL}/${kind}/${id}`;
