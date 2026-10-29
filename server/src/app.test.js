const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./app');
const { createToken } = require('./middleware/auth');

const userId = '64b000000000000000000001';
const otherId = '64b000000000000000000002';
const token = createToken({ _id: userId });

// These run without a database

test('GET /api/health returns 200', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('login without a password returns 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ login: 'someone' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /required/);
});

test('register without a login returns 400', async () => {
  const res = await request(app).post('/api/users').send({ password: 'x' });
  assert.equal(res.status, 400);
});

test('invalid JSON returns 400', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"login":');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Request body is not valid JSON');
});

test('protected routes without a token return 401', async () => {
  const res = await request(app).get(`/api/users/${otherId}/cards`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Authentication required');
});

test('a bad token returns 401', async () => {
  const res = await request(app).get(`/api/cards/${otherId}`).set('Authorization', 'Bearer nope');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid or expired token');
});

test("another user's account returns 403", async () => {
  const res = await request(app).get(`/api/users/${otherId}`).set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});

test('a malformed id returns 400', async () => {
  const res = await request(app).get('/api/users/not-an-id').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Invalid userId/);
});

test('unknown routes return a JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /Route not found/);
});
