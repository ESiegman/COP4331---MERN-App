import { hkdfSync, randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { conflict, badRequest, HttpError } from '../lib/errors.js';

// Image Storage from the use case diagram.
//
// Images are files on the server's own disk: UPLOAD_DIR, a Docker volume on the droplet. The API
// serves them under /api/uploads/files. Clients use the same steps a cloud bucket would need:
// ask for a ticket, PUT the image to the ticket's uploadUrl, then send the url as imageUrl,
// avatarUrl or coverImageUrl on the normal routes. Moving to a bucket later only changes this file.

export const UPLOAD_KINDS = ['item', 'avatar', 'cover'];
export const MAX_BYTES = 5 * 1024 * 1024;
const TICKET_MINUTES = 10;
const ALGORITHM = 'HS256';

export const uploadDir = path.resolve(env.UPLOAD_DIR);

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// The first bytes every file of each type starts with, so a renamed text file or script is refused
const LOOKS_LIKE = {
  'image/jpeg': (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (bytes) => bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP',
};

// Tickets are signed with their own key, derived from JWT_SECRET, so a ticket never works as a
// login token and a login token never works as a ticket
const ticketKey = new Uint8Array(hkdfSync('sha256', env.JWT_SECRET, '', 'upload-ticket', 32));

const publicUrl = (file) => `${env.APP_URL}/api/uploads/files/${file}`;

const invalidTicket = () =>
  new HttpError(400, 'This upload link is invalid or has expired. Ask for a new one.', { code: 'UPLOAD_TICKET_INVALID' });

/**
 * A short-lived ticket for uploading one image. The file's name is chosen here, at random, under
 * the kind and the user's id, so a ticket can only ever create that one file.
 */
export async function createUploadTicket({ userId, kind, contentType }) {
  const file = `${kind}/${userId}/${randomBytes(12).toString('hex')}.${EXTENSIONS[contentType]}`;
  const expiresAt = new Date(Date.now() + TICKET_MINUTES * 60_000);
  const ticket = await new SignJWT({ file, contentType })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(userId))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(ticketKey);

  return {
    uploadUrl: `${env.APP_URL}/api/uploads/${ticket}`,
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    maxBytes: MAX_BYTES,
    expiresAt,
    url: publicUrl(file),
  };
}

/**
 * Saves the image a ticket allows. Each ticket works once: the file is only created if it
 * doesn't exist yet, so a second upload with the same ticket can't replace the first.
 */
export async function storeUpload(ticket, contentType, bytes) {
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(ticket, ticketKey, { algorithms: [ALGORITHM] }));
  } catch {
    throw invalidTicket();
  }

  if (contentType !== claims.contentType) {
    throw badRequest(`Send the image with Content-Type: ${claims.contentType}, the type the ticket was made for`);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw badRequest('Send the image as the request body');
  if (!LOOKS_LIKE[claims.contentType](bytes)) throw badRequest(`That file is not a ${claims.contentType} image`);

  const target = path.join(uploadDir, claims.file);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await writeFile(target, bytes, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') throw conflict('This upload link was already used. Ask for a new one.');
    throw err;
  }
  return { url: publicUrl(claims.file) };
}

// Every image an account uploaded, for when the account is deleted
export async function deleteUserUploads(userId) {
  await Promise.all(
    UPLOAD_KINDS.map((kind) => rm(path.join(uploadDir, kind, String(userId)), { recursive: true, force: true })),
  );
}
