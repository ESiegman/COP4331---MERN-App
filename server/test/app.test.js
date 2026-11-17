import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/jwt.js';

// These run without a database: every request here is answered before a query is made.

const app = createApp();
const auth = { Authorization: `Bearer ${await signToken('64b000000000000000000001')}` };
const ID = '64b000000000000000000002';

test('GET /api/health answers 200', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('unknown routes answer a JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.match(res.body.error, /Route not found: GET \/api\/nope/);
});

test('a body that is not valid JSON answers 400', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Request body is not valid JSON');
});

test('register lists every invalid field', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: 'a!', email: 'not-an-email', password: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'VALIDATION');
  assert.deepEqual(
    res.body.details.map((detail) => detail.field),
    ['username', 'email', 'password'],
  );
  assert.equal(res.body.error, 'username: must be 3-20 letters, numbers or underscores');
});

test('register says which fields are missing', async () => {
  const res = await request(app).post('/api/auth/register').send({ username: 'someone' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'email: is required');
});

test('register refuses reserved usernames', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: 'Admin', email: 'someone@example.com', password: 'long enough' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'username: is not available');
});

test('"me" can never be a username, so it cannot shadow /users/me', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username: 'me', email: 'someone@example.com', password: 'long enough' });
  assert.equal(res.status, 400);
  assert.equal(res.body.details[0].field, 'username');
});

test('length limits say what the limit is, not "must be text"', async () => {
  const cases = [
    ['post', '/api/templates', { title: 'x'.repeat(101) }, 'title: must be at most 100 characters'],
    ['post', '/api/templates', { title: '   ' }, 'title: cannot be empty'],
    ['post', '/api/templates', { title: 5 }, 'title: must be text'],
    ['post', `/api/rankings/${ID}/comments`, { body: 'x'.repeat(1001) }, 'body: must be at most 1000 characters'],
    ['patch', '/api/users/me', { bio: 'x'.repeat(301) }, 'bio: must be at most 300 characters'],
    ['post', '/api/templates/suggest-items', { topic: 'a' }, 'topic: must be at least 2 characters'],
  ];
  for (const [method, path, body, message] of cases) {
    const res = await request(app)[method](path).set(auth).send(body);
    assert.equal(res.status, 400, path);
    assert.equal(res.body.error, message);
  }
});

test('login without a password answers 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'someone@example.com' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'password: is required');
});

test('a bad token answers 401, also on routes guests may use', async () => {
  for (const path of ['/api/users/me', `/api/rankings/${ID}`]) {
    const res = await request(app).get(path).set('Authorization', 'Bearer nope');
    assert.equal(res.status, 401, path);
    assert.equal(res.body.error, 'Invalid or expired token');
  }
});

test('a malformed id answers 400', async () => {
  const res = await request(app).get('/api/templates/not-an-id');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'templateId: must be a 24-character id');
  assert.deepEqual(res.body.details[0], {
    in: 'params',
    field: 'templateId',
    message: 'must be a 24-character id',
  });
});

test('query strings are validated and coerced', async () => {
  const res = await request(app).get('/api/templates?limit=500&sort=oldest');
  assert.equal(res.status, 400);
  assert.deepEqual(
    res.body.details.map((detail) => `${detail.in}.${detail.field}`),
    ['query.limit', 'query.sort'],
  );
});

test('a cursor that was not issued by the API answers 400', async () => {
  const forged = Buffer.from(JSON.stringify({ value: { $ne: null }, id: ID })).toString('base64url');
  for (const cursor of ['garbage', forged]) {
    const res = await request(app).get(`/api/templates?cursor=${cursor}`);
    assert.equal(res.status, 400, cursor);
    assert.equal(res.body.error, 'Invalid cursor');
  }
});

test('a PATCH with no fields answers 400', async () => {
  const res = await request(app).patch(`/api/templates/${ID}`).set(auth).send({ unknown: true });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Send at least one field to change');
});

test('saving a ranking refuses an item placed in two tiers', async () => {
  const res = await request(app)
    .put(`/api/rankings/${ID}`)
    .set(auth)
    .send({
      visibility: 'public',
      tiers: [
        { label: 'S', color: '#ff7f7f', itemIds: [ID] },
        { label: 'A', color: '#ffbf7f', itemIds: [ID.toUpperCase()] },
      ],
    });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'tiers: an item can only be in one tier');
});

test('saving a ranking refuses a color that is not hex, and an empty board', async () => {
  const bad = await request(app)
    .put(`/api/rankings/${ID}`)
    .set(auth)
    .send({ visibility: 'public', tiers: [{ label: 'S', color: 'red', itemIds: [] }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.details[0].field, 'tiers.0.color');

  const empty = await request(app).put(`/api/rankings/${ID}`).set(auth).send({ visibility: 'public', tiers: [] });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.details[0].field, 'tiers');
});
