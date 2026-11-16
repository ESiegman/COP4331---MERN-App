import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const ALGORITHM = 'HS256';
const secret = new TextEncoder().encode(env.JWT_SECRET);

// The token only carries the user's id (the "sub" claim) and an expiry
export const signToken = (userId) =>
  new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);

// Resolves to the user id, or rejects if the token is malformed, tampered with or expired
export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });
  return payload.sub;
}
