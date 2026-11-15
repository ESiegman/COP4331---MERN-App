import { notImplemented } from '../lib/errors.js';

// Google OAuth and Discord OAuth from the use case diagram.

/**
 * Trades the authorization code the client got from Google or Discord for that person's identity.
 * The web app and the Expo app both run the provider's sign-in screen themselves (authorization
 * code flow with PKCE) and send the result here.
 *
 * TODO:
 * 1. Check redirectUri against a list of allowed values from the environment.
 * 2. POST { code, codeVerifier, redirectUri, client id and secret } to the provider's token
 *    endpoint with fetch(), then GET the provider's user info endpoint with the access token.
 * 3. Return { providerUserId, email, emailVerified, name, avatarUrl }.
 */
export async function exchangeCode(provider, { code, codeVerifier, redirectUri }) {
  throw notImplemented('integrations/oauth.exchangeCode');
}
