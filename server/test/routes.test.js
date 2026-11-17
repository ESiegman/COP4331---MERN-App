import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/jwt.js';

// Every route in the API plan, with a valid request for each. No database needed.

const app = createApp();
const auth = { Authorization: `Bearer ${await signToken('64b000000000000000000001')}` };
const ID = '64b000000000000000000002';

const oauth = { code: 'abc', codeVerifier: 'def', redirectUri: 'https://app.example.com/callback' };
const pushToken = { token: 'ExponentPushToken[abc123]' };
const board = { visibility: 'public', tiers: [{ label: 'S', color: '#ff7f7f', itemIds: [ID] }] };

const TOKEN = true;
const GUEST = false;
const TODO = 'todo'; // the service function behind the route is not written yet
const DONE = 'done'; // written, and covered by an integration test

// [method, path, body, needs a token?, state]
const ROUTES = [
  ['get', '/auth/oauth/providers', undefined, GUEST, DONE],
  ['post', '/auth/oauth/google', oauth, GUEST, DONE],

  ['get', '/users/me', undefined, TOKEN, DONE],
  ['patch', '/users/me', { bio: 'hi' }, TOKEN, DONE],
  ['post', '/users/me/push-tokens', pushToken, TOKEN, DONE],
  ['delete', '/users/me/push-tokens', pushToken, TOKEN, DONE],
  ['post', '/users/me/oauth/discord', oauth, TOKEN, DONE],
  ['delete', '/users/me/oauth/discord', undefined, TOKEN, DONE],
  ['get', '/users/ada', undefined, GUEST, DONE],
  ['get', '/users/ada/templates', undefined, GUEST, DONE],
  ['get', '/users/ada/rankings', undefined, GUEST, DONE],

  ['get', '/templates?q=snacks&sort=popular', undefined, GUEST, DONE],
  ['post', '/templates', { title: 'Gas station snacks', items: [{ name: 'Chips' }] }, TOKEN, DONE],
  ['post', '/templates/suggest-items', { topic: 'fast food chains' }, TOKEN, DONE],
  ['get', `/templates/${ID}`, undefined, GUEST, DONE],
  ['patch', `/templates/${ID}`, { title: 'Snacks' }, TOKEN, DONE],
  ['delete', `/templates/${ID}`, undefined, TOKEN, DONE],
  ['post', `/templates/${ID}/items`, { name: 'Chips' }, TOKEN, DONE],
  ['patch', `/templates/${ID}/items/${ID}`, { name: 'Crisps' }, TOKEN, DONE],
  ['delete', `/templates/${ID}/items/${ID}`, undefined, TOKEN, DONE],
  ['get', `/templates/${ID}/rankings`, undefined, GUEST, DONE],
  ['post', `/templates/${ID}/rankings`, undefined, TOKEN, DONE],
  ['get', `/templates/${ID}/community-ranking`, undefined, GUEST, DONE],

  ['get', '/rankings?sort=top', undefined, GUEST, DONE],
  ['get', `/rankings/${ID}`, undefined, GUEST, DONE],
  ['put', `/rankings/${ID}`, board, TOKEN, DONE],
  ['delete', `/rankings/${ID}`, undefined, TOKEN, DONE],
  ['put', `/rankings/${ID}/like`, undefined, TOKEN, DONE],
  ['delete', `/rankings/${ID}/like`, undefined, TOKEN, DONE],
  ['get', `/rankings/${ID}/comments`, undefined, GUEST, DONE],
  ['post', `/rankings/${ID}/comments`, { body: 'Chips in A tier?' }, TOKEN, DONE],

  ['patch', `/comments/${ID}`, { body: 'Edited' }, TOKEN, DONE],
  ['delete', `/comments/${ID}`, undefined, TOKEN, DONE],

  ['get', '/notifications?unread=true', undefined, TOKEN, DONE],
  ['patch', `/notifications/${ID}`, { read: true }, TOKEN, DONE],
  ['post', '/notifications/read-all', undefined, TOKEN, DONE],

  ['post', '/uploads/sign', { kind: 'item', contentType: 'image/png' }, TOKEN, TODO],
];

const send = (method, path, body, headers = {}) => {
  const req = request(app)[method](`/api${path}`).set(headers);
  return body ? req.send(body) : req;
};

test('routes that need an account refuse guests with 401', async () => {
  for (const [method, path, body] of ROUTES.filter((route) => route[3] === TOKEN)) {
    const res = await send(method, path, body);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path}`);
    assert.equal(res.body.error, 'Authentication required');
  }
});

// When you write a service function, change its row from TODO to DONE and cover it in an
// integration test. Left as TODO, this test would wait on a database it does not have.
test('routes whose service is not written yet answer 501', async () => {
  for (const [method, path, body, needsToken] of ROUTES.filter((route) => route[4] === TODO)) {
    const res = await send(method, path, body, needsToken ? auth : {});
    assert.equal(res.status, 501, `${method.toUpperCase()} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'NOT_IMPLEMENTED');
  }
});
