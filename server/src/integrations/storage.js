import { notImplemented } from '../lib/errors.js';

// Image Storage from the use case diagram.

/**
 * Creates a short-lived ticket that lets a client upload one image straight to the storage
 * provider, so image bytes never pass through this API.
 *
 * TODO: choose a provider, then return what its direct upload needs, for example
 * { uploadUrl, fields, publicUrl }. Put the user id and kind in the object's path, and limit
 * the ticket to the given contentType and a maximum size. Once a provider is chosen, also
 * tighten imageUrl in lib/schemas.js so only URLs on that provider's host are accepted.
 */
export async function createUploadTicket({ userId, kind, contentType }) {
  throw notImplemented('integrations/storage.createUploadTicket');
}
