import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// Google OAuth and Discord OAuth from the use case diagram. The web and Expo apps run the
// provider's sign-in page themselves (authorization code flow with PKCE) and send the code they
// get back. Only the API holds the client secrets, so only the API can trade that code for who
// the person is.

const TIMEOUT_MS = 10_000;

const discordAvatar = ({ id, avatar }) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.${avatar.startsWith('a_') ? 'gif' : 'png'}` : undefined;

// Kept as a plain object so tests can fill in client ids without restarting the process
export const oauthProviders = {
  google: {
    name: 'Google',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    toIdentity: (user) => ({
      providerUserId: user.sub,
      email: user.email,
      emailVerified: user.email_verified === true || user.email_verified === 'true',
      name: user.name,
      avatarUrl: user.picture,
    }),
  },
  discord: {
    name: 'Discord',
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/v10/oauth2/token',
    userUrl: 'https://discord.com/api/v10/users/@me',
    scope: 'identify email',
    toIdentity: (user) => ({
      providerUserId: user.id,
      email: user.email ?? undefined,
      emailVerified: user.verified === true,
      name: user.global_name ?? user.username,
      avatarUrl: discordAvatar(user),
    }),
  },
};

// The redirect URIs a client may use. The provider checks the code was issued for the same one.
export const allowedRedirectUris = env.OAUTH_REDIRECT_URIS ?? [`${env.APP_URL}/oauth/callback`];

const isConfigured = (provider) => Boolean(provider.clientId && provider.clientSecret);

export const providerName = (provider) => oauthProviders[provider].name;

// GET /auth/oauth/providers: what a client needs to open each provider's sign-in page
export function listProviders() {
  return Object.entries(oauthProviders)
    .filter(([, provider]) => isConfigured(provider))
    .map(([id, { name, clientId, authorizeUrl, scope }]) => ({ provider: id, name, clientId, authorizeUrl, scope }));
}

async function call(provider, step, url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    logger.warn({ err, provider: provider.name, step }, 'OAuth provider unreachable');
    throw new HttpError(503, `Couldn't reach ${provider.name}. Try again in a moment.`, { code: 'OAUTH_UNAVAILABLE' });
  }
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

// Something on our side, such as a wrong secret or an unregistered redirect URI. Logged with the
// provider's reason; the client gets a generic answer.
function failed(provider, step, res, body) {
  logger.error(
    { provider: provider.name, step, status: res.status, error: body.error, description: body.error_description },
    'OAuth request failed',
  );
  return new HttpError(502, `${provider.name} sign-in failed. Try again later.`, { code: 'OAUTH_FAILED' });
}

/**
 * Trades the authorization code from the provider's sign-in page for that person's identity:
 * { providerUserId, email, emailVerified, name, avatarUrl }. email is lowercase, and
 * emailVerified is only true when the provider says it checked the address.
 */
export async function exchangeCode(id, { code, codeVerifier, redirectUri }) {
  const provider = oauthProviders[id];
  if (!isConfigured(provider)) {
    throw new HttpError(501, `${provider.name} sign-in isn't set up on this server`, { code: 'OAUTH_NOT_CONFIGURED' });
  }
  if (!allowedRedirectUris.includes(redirectUri)) {
    throw new HttpError(400, 'This redirectUri is not allowed', { code: 'OAUTH_REDIRECT_NOT_ALLOWED' });
  }

  const token = await call(provider, 'token', provider.tokenUrl, {
    method: 'POST',
    headers: { accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
    }),
  });
  // invalid_grant: the code expired, was already used, or doesn't match the verifier
  if (token.body.error === 'invalid_grant') {
    throw new HttpError(400, `The ${provider.name} sign-in expired or was already used. Try again.`, { code: 'OAUTH_CODE_INVALID' });
  }
  if (!token.res.ok || !token.body.access_token) throw failed(provider, 'token', token.res, token.body);

  const user = await call(provider, 'user', provider.userUrl, {
    headers: { accept: 'application/json', authorization: `Bearer ${token.body.access_token}` },
  });
  if (!user.res.ok) throw failed(provider, 'user', user.res, user.body);

  const identity = provider.toIdentity(user.body);
  if (!identity.providerUserId) throw failed(provider, 'user', user.res, { error: 'no user id in the answer' });

  const email = identity.email?.trim().toLowerCase() || undefined;
  return {
    ...identity,
    providerUserId: String(identity.providerUserId),
    email,
    emailVerified: Boolean(email && identity.emailVerified),
  };
}
