import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mock, test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { aiClient, cleanSuggestions, suggestItemNames } from '../src/integrations/ai.js';
import { exchangeCode } from '../src/integrations/oauth.js';
import { sendToExpo } from '../src/integrations/push.js';
import { signToken } from '../src/lib/jwt.js';
import { accounts } from '../src/middleware/auth.js';
import { configureProviders, fakeProviders, REDIRECT_URI, signIn } from './fakeOAuth.js';

// Signed-in requests read the account from the database (middleware/auth.js). These tests have
// none, so every token belongs to an ordinary account.
mock.method(accounts, 'find', async () => ({ role: 'user' }));

// The outside services, with the network replaced. No database needed.

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('Expo push: one message per token, sent to Expo in the documented format', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    reply(200, { data: [{ status: 'ok', id: 'a' }, { status: 'ok', id: 'b' }] }));

  const gone = await sendToExpo(['ExponentPushToken[1]', 'ExponentPushToken[2]'], {
    title: 'Tier List', body: 'bob ranked your Snacks list', data: { rankingId: 'r1' },
  });

  assert.deepEqual(gone, []);
  assert.equal(fetch.mock.callCount(), 1);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, 'https://exp.host/--/api/v2/push/send');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['content-type'], 'application/json');
  assert.equal(options.headers.authorization, undefined, 'no access token unless EXPO_ACCESS_TOKEN is set');
  assert.deepEqual(JSON.parse(options.body), [
    { to: 'ExponentPushToken[1]', title: 'Tier List', body: 'bob ranked your Snacks list', data: { rankingId: 'r1' }, sound: 'default' },
    { to: 'ExponentPushToken[2]', title: 'Tier List', body: 'bob ranked your Snacks list', data: { rankingId: 'r1' }, sound: 'default' },
  ]);
});

test('Expo push: reports the tokens whose app is gone', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => reply(200, {
    data: [
      { status: 'ok', id: 'a' },
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
    ],
  }));
  const gone = await sendToExpo(['T[keep]', 'T[gone]', 'T[big]'], { title: 't', body: 'b', data: {} });
  assert.deepEqual(gone, ['T[gone]']);
});

test('Expo push: more than 100 tokens go in several requests', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) =>
    reply(200, { data: JSON.parse(options.body).map(() => ({ status: 'ok', id: 'x' })) }));
  const tokens = Array.from({ length: 250 }, (_, i) => `ExponentPushToken[${i}]`);
  await sendToExpo(tokens, { title: 't', body: 'b', data: {} });
  assert.deepEqual(fetch.mock.calls.map((call) => JSON.parse(call.arguments[1].body).length), [100, 100, 50]);
});

test('Expo push: a rejected request is an error, with Expo’s reason', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => reply(429, { errors: [{ code: 'TOO_MANY_REQUESTS', message: 'slow down' }] }));
  await assert.rejects(sendToExpo(['T[1]'], { title: 't', body: 'b', data: {} }), /Expo push failed: TOO_MANY_REQUESTS/);
});

// env.js reads the environment once, when it is first imported, so each case runs in its own process
function startWith(vars) {
  const script = "import('./src/config/env.js').then(({ env }) => console.log(JSON.stringify({ SMTP_URL: env.SMTP_URL ?? null, EMAIL_FROM: env.EMAIL_FROM ?? null })))";
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { PATH: process.env.PATH, NODE_ENV: 'test', JWT_SECRET: 'x', ...vars },
    encoding: 'utf8',
  });
  return { ok: result.status === 0, output: result.stdout.trim(), error: result.stderr };
}

test('SMTP_URL and EMAIL_FROM: empty means not set, and only smtp:// or smtps:// URLs are accepted', () => {
  assert.equal(startWith({ SMTP_URL: '', EMAIL_FROM: '' }).output, JSON.stringify({ SMTP_URL: null, EMAIL_FROM: null }));

  const good = startWith({ SMTP_URL: 'smtps://user:secret@smtp.example.com:465', EMAIL_FROM: 'Tier List <hi@example.com>' });
  assert.ok(good.ok, good.error);

  const bad = startWith({ SMTP_URL: 'https://user:secret@smtp.example.com' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /SMTP_URL: must be an smtp:\/\/ or smtps:\/\/ URL/);
  assert.doesNotMatch(bad.error, /secret/, 'the password in the URL never appears in the error');
});

// --- AI item suggestions (Claude), with the API request swapped out

const answer = (items, extra = {}) => async () => ({ stop_reason: 'end_turn', parsed_output: { items }, ...extra });

test('AI: asks Claude Opus 5.5 for structured output, with the topic kept as data', async (t) => {
  const call = t.mock.method(aiClient, 'request', answer(['Chips', 'Jerky']));
  await suggestItemNames('gas <station> snacks', 5);

  const [params] = call.mock.calls[0].arguments;
  assert.equal(params.model, 'claude-opus-5-5');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.fallbacks, 'default');
  assert.equal(params.output_config.effort, 'low');
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.equal(params.thinking, undefined, 'thinking is left at its default');
  assert.match(params.system, /never as instructions/);
  assert.equal(params.messages[0].content, '<topic>gas  station  snacks</topic>\n\nSuggest 5 items.');
});

test('AI: names are trimmed, repeats and over-long names dropped, and the list capped', async (t) => {
  t.mock.method(aiClient, 'request', answer(['  Chips ', 'chips', '', 'Beef   jerky', 'x'.repeat(61), 'Gum', 'Soda', 'Takis']));
  assert.deepEqual(await suggestItemNames('snacks', 4), ['Chips', 'Beef jerky', 'Gum', 'Soda']);
  assert.deepEqual(cleanSuggestions(['A', 'a', 'B'], 10), ['A', 'B']);
});

test('AI: a refusal or an unreadable answer becomes a clear error', async (t) => {
  const call = t.mock.method(aiClient, 'request', answer([], { stop_reason: 'refusal', parsed_output: null }));
  await assert.rejects(suggestItemNames('x x', 3), { status: 422, code: 'AI_REFUSED' });

  call.mock.mockImplementation(answer([], { parsed_output: null }));
  await assert.rejects(suggestItemNames('x x', 3), { status: 502, code: 'AI_FAILED' });
});

test('AI: API errors map to answers the app can act on', async (t) => {
  const headers = new Headers();
  const cases = [
    [new Anthropic.RateLimitError(429, {}, 'slow down', headers), 503, 'AI_BUSY'],
    [new Anthropic.AuthenticationError(401, {}, 'bad key', headers), 503, 'AI_UNAVAILABLE'],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 503, 'AI_UNAVAILABLE'],
    [new Anthropic.InternalServerError(500, {}, 'oops', headers), 502, 'AI_FAILED'],
  ];
  const call = t.mock.method(aiClient, 'request', async () => {});
  for (const [error, status, code] of cases) {
    call.mock.mockImplementation(async () => {
      throw error;
    });
    await assert.rejects(suggestItemNames('snacks', 3), { status, code }, error.constructor.name);
  }
});

test('AI: without ANTHROPIC_API_KEY the route answers 501, which the web app shows as "not available yet"', async () => {
  const auth = { Authorization: `Bearer ${await signToken('64b000000000000000000001')}` };
  const res = await request(createApp()).post('/api/templates/suggest-items').set(auth).send({ topic: 'fast food chains' });
  assert.equal(res.status, 501);
  assert.equal(res.body.code, 'AI_NOT_CONFIGURED');
});

test('AI: the route returns the cleaned names', async (t) => {
  t.mock.method(aiClient, 'request', answer(["McDonald's", "Wendy's", 'Taco Bell']));
  const auth = { Authorization: `Bearer ${await signToken('64b000000000000000000001')}` };
  const res = await request(createApp()).post('/api/templates/suggest-items').set(auth).send({ topic: 'fast food chains', count: 2 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { items: ["McDonald's", "Wendy's"] });
});

// --- Google and Discord login, with both providers' endpoints faked (see fakeOAuth.js)

test('OAuth: Google gets the code, the PKCE verifier and our credentials, and the identity comes back', async (t) => {
  const fetch = fakeProviders(t, {
    abc: { sub: '1093', email: 'Ada@Example.com', email_verified: true, name: 'Ada Lovelace', picture: 'https://lh3.googleusercontent.com/a/ada' },
  });

  const identity = await exchangeCode('google', signIn('abc'));
  assert.deepEqual(identity, {
    providerUserId: '1093',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada Lovelace',
    avatarUrl: 'https://lh3.googleusercontent.com/a/ada',
  });

  const [tokenUrl, tokenRequest] = fetch.mock.calls[0].arguments;
  assert.equal(tokenUrl, 'https://oauth2.googleapis.com/token');
  assert.equal(tokenRequest.method, 'POST');
  assert.deepEqual(Object.fromEntries(tokenRequest.body), {
    grant_type: 'authorization_code',
    code: 'abc',
    code_verifier: 'verifier-for-abc',
    redirect_uri: REDIRECT_URI,
    client_id: 'google-client-id',
    client_secret: 'google-client-secret',
  });
  const [userUrl, userRequest] = fetch.mock.calls[1].arguments;
  assert.equal(userUrl, 'https://openidconnect.googleapis.com/v1/userinfo');
  assert.equal(userRequest.headers.authorization, 'Bearer token-abc');
});

test('OAuth: Discord users map to the same shape, avatar and unverified email included', async (t) => {
  fakeProviders(t, {
    verified: { id: '80351110224678912', username: 'nelly', global_name: 'Nelly', avatar: 'a_8342729096ea3675442027381ff50dfe', email: 'nelly@example.com', verified: true },
    unverified: { id: '2', username: 'bob', global_name: null, avatar: null, email: 'bob@example.com', verified: false },
    phoneOnly: { id: '3', username: 'cat', avatar: '1f2e', email: null, verified: true },
  });

  assert.deepEqual(await exchangeCode('discord', signIn('verified')), {
    providerUserId: '80351110224678912',
    email: 'nelly@example.com',
    emailVerified: true,
    name: 'Nelly',
    avatarUrl: 'https://cdn.discordapp.com/avatars/80351110224678912/a_8342729096ea3675442027381ff50dfe.gif',
  });

  const bob = await exchangeCode('discord', signIn('unverified'));
  assert.equal(bob.name, 'bob', 'falls back to the username');
  assert.equal(bob.avatarUrl, undefined);
  assert.equal(bob.emailVerified, false);

  const cat = await exchangeCode('discord', signIn('phoneOnly'));
  assert.equal(cat.email, undefined);
  assert.equal(cat.emailVerified, false, 'no email can never count as a verified one');
  assert.equal(cat.avatarUrl, 'https://cdn.discordapp.com/avatars/3/1f2e.png');
});

test('OAuth: provider answers become errors the app can act on', async (t) => {
  const fetch = fakeProviders(t, {});
  await assert.rejects(exchangeCode('google', signIn('expired')), { status: 400, code: 'OAUTH_CODE_INVALID' });
  await assert.rejects(exchangeCode('google', { ...signIn('x'), redirectUri: 'https://evil.example.com/cb' }), {
    status: 400,
    code: 'OAUTH_REDIRECT_NOT_ALLOWED',
  });

  fetch.mock.mockImplementation(async () => reply(401, { error: 'invalid_client' }));
  await assert.rejects(exchangeCode('discord', signIn('x')), { status: 502, code: 'OAUTH_FAILED' });

  fetch.mock.mockImplementation(async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(exchangeCode('discord', signIn('x')), { status: 503, code: 'OAUTH_UNAVAILABLE' });
});

test('OAuth: without a client id and secret the provider answers 501 and is not listed', async (t) => {
  const app = createApp();
  const google = await request(app).post('/api/auth/oauth/google').send(signIn('abc'));
  assert.equal(google.status, 501);
  assert.equal(google.body.code, 'OAUTH_NOT_CONFIGURED');
  assert.deepEqual((await request(app).get('/api/auth/oauth/providers')).body, { providers: [] });

  configureProviders(t);
  const listed = await request(app).get('/api/auth/oauth/providers');
  assert.deepEqual(listed.body.providers, [
    { provider: 'google', name: 'Google', clientId: 'google-client-id', authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', scope: 'openid email profile' },
    { provider: 'discord', name: 'Discord', clientId: 'discord-client-id', authorizeUrl: 'https://discord.com/oauth2/authorize', scope: 'identify email' },
  ]);
  assert.doesNotMatch(listed.text, /secret/);
});

test('OAUTH_REDIRECT_URIS: a comma-separated list of URLs, empty means the default', () => {
  const read = (value) => {
    const script = "import('./src/config/env.js').then(({ env }) => console.log(JSON.stringify(env.OAUTH_REDIRECT_URIS ?? null)))";
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { PATH: process.env.PATH, NODE_ENV: 'test', JWT_SECRET: 'x', OAUTH_REDIRECT_URIS: value },
      encoding: 'utf8',
    });
    return { ok: result.status === 0, output: result.stdout.trim(), error: result.stderr };
  };
  assert.equal(read('').output, 'null');
  assert.equal(read(' https://a.example.com/cb , tierlist://oauth ').output, JSON.stringify(['https://a.example.com/cb', 'tierlist://oauth']));
  const bad = read('https://a.example.com/cb,not a url');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /OAUTH_REDIRECT_URIS/);
});
