import { createUploadTicket, storeUpload } from '../../integrations/storage.js';

// UploadService from the class diagram  (Take / upload item photo).
// The client asks for a ticket, PUTs the image to the ticket's uploadUrl, then sends the
// resulting url as imageUrl, avatarUrl or coverImageUrl on the normal endpoints.

// POST /uploads/sign
export const signImageUpload = (userId, { kind, contentType }) =>
  createUploadTicket({ userId, kind, contentType });

// PUT /uploads/:ticket. The ticket is the permission, the way a cloud bucket's signed URL is,
// so no login token is needed.
export const storeImageUpload = (ticket, contentType, bytes) => storeUpload(ticket, contentType, bytes);
