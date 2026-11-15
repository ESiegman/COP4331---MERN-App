import { createUploadTicket } from '../../integrations/storage.js';

// UploadService from the class diagram  (Take / upload item photo).
// The client asks for a ticket, uploads the image straight to storage with it, then sends
// the resulting URL as imageUrl, avatarUrl or coverImageUrl on the normal endpoints.

// POST /uploads/sign
export const signImageUpload = (userId, { kind, contentType }) =>
  createUploadTicket({ userId, kind, contentType });
