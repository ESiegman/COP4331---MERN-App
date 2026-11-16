import { notImplemented } from '../lib/errors.js';

// Push Notifications (Expo) from the use case diagram.

/**
 * Sends one push message to each of a user's devices.
 *
 * TODO: POST an array of { to, title, body, data } to Expo's push service with fetch(),
 * one entry per token. Expo answers with a ticket per message; when a ticket says the device
 * is no longer registered, remove that token from User.pushTokens.
 */
export async function sendPush(pushTokens, { title, body, data }) {
  throw notImplemented('integrations/push.sendPush');
}
