import { env } from '../config/env.js';

// Push Notifications (Expo) from the use case diagram. The Expo app registers each phone's
// Expo push token with POST /users/me/push-tokens; this sends to those tokens through Expo's
// push service, which needs no account or key unless "enhanced push security" is turned on.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_REQUEST = 100;

// Pushes "sent" while tests run, so a test can check what would have gone out
export const pushOutbox = [];

// Sends one message to each token. Resolves to the tokens Expo says no longer belong to an
// installed app (DeviceNotRegistered), so the caller can forget them.
export async function sendToExpo(pushTokens, { title, body, data }) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;

  const gone = [];
  for (let start = 0; start < pushTokens.length; start += MAX_PER_REQUEST) {
    const batch = pushTokens.slice(start, start + MAX_PER_REQUEST);
    const messages = batch.map((to) => ({ to, title, body, data, sound: 'default' }));
    const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const reason = result.errors?.map((error) => error.code).join(', ') || response.status;
      throw new Error(`Expo push failed: ${reason}`);
    }
    // One ticket per message, in the same order
    (result.data ?? []).forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') gone.push(batch[i]);
    });
  }
  return gone;
}

// Kept on an object so tests can swap the sender out
export const pushClient = {
  async send(pushTokens, message) {
    if (env.NODE_ENV === 'test') {
      pushOutbox.push({ to: pushTokens, ...message });
      return [];
    }
    return sendToExpo(pushTokens, message);
  },
};
