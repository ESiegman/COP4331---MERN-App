const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('./app');

// These don't need a database. The full login/register flow is covered by
// the Bruno collection in api-tests/.

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

test('unknown routes return a JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /Route not found/);
});
