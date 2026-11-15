import { z } from 'zod';
import { atLeastOneField, imageUrl, pageQuery, text } from '../../lib/schemas.js';

// PATCH /users/me. Send only what changes. null clears displayName, bio or avatarUrl.
export const updateAccount = atLeastOneField(
  z
    .object({
      displayName: text().trim().min(1).max(50).nullable(),
      bio: text().trim().max(300).nullable(),
      avatarUrl: imageUrl.nullable(),
      notificationPrefs: z
        .object({ newComment: z.boolean(), newRanking: z.boolean(), newLike: z.boolean() })
        .partial(),
    })
    .partial(),
);

export const pushToken = z.object({
  token: text().regex(/^Expo(nent)?PushToken\[.+\]$/, 'must be an Expo push token'),
});

// Usernames are stored lowercase, so /users/Ada finds ada
export const usernameParams = z.object({ username: text().trim().toLowerCase().min(1).max(20) });

export const listQuery = pageQuery;
