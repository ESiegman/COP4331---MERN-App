import { allowedRedirectUris, oauthProviders } from '../src/integrations/oauth.js';

// Stand-ins for Google's and Discord's sign-in endpoints, shared by the OAuth tests

export const REDIRECT_URI = allowedRedirectUris[0];

export const signIn = (code) => ({ code, codeVerifier: `verifier-for-${code}`, redirectUri: REDIRECT_URI });

export const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Gives both providers a client id and secret for the length of the test
export function configureProviders(t) {
  for (const [id, provider] of Object.entries(oauthProviders)) {
    const { clientId, clientSecret } = provider;
    provider.clientId = `${id}-client-id`;
    provider.clientSecret = `${id}-client-secret`;
    t.after(() => Object.assign(provider, { clientId, clientSecret }));
  }
}

// Replaces fetch with both providers' token and user endpoints. people maps each code the test
// will send to the user the provider would describe (Google's userinfo or Discord's /users/@me).
// An unknown code gets the providers' answer for an expired one.
export function fakeProviders(t, people) {
  configureProviders(t);
  return t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const provider = Object.values(oauthProviders).find((p) => url === p.tokenUrl || url === p.userUrl);
    if (!provider) throw new Error(`unexpected fetch to ${url}`);

    if (url === provider.tokenUrl) {
      const code = new URLSearchParams(init.body).get('code');
      return people[code] ? reply(200, { access_token: `token-${code}`, token_type: 'Bearer' }) : reply(400, { error: 'invalid_grant' });
    }
    const code = init.headers.authorization.replace('Bearer token-', '');
    return reply(200, people[code]);
  });
}
