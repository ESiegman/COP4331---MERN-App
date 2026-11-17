import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, mock, test } from 'node:test';
import request from 'supertest';

// Image uploads, written to a temporary folder. No database needed.
// UPLOAD_DIR is read once at startup, so it is set before the app is imported.
const dir = await mkdtemp(path.join(tmpdir(), 'tier-list-uploads-'));
process.env.UPLOAD_DIR = dir;

const { createApp } = await import('../src/app.js');
const { deleteUserUploads } = await import('../src/integrations/storage.js');
const { signToken } = await import('../src/lib/jwt.js');
const { accounts } = await import('../src/middleware/auth.js');

mock.method(accounts, 'find', async () => ({ role: 'user' }));
after(() => rm(dir, { recursive: true, force: true }));

const app = createApp();
const USER_ID = '64b000000000000000000001';
const auth = { Authorization: `Bearer ${await signToken(USER_ID)}` };
// A real 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const pathOf = (url) => new URL(url).pathname;
const sign = (body = { kind: 'item', contentType: 'image/png' }) =>
  request(app).post('/api/uploads/sign').set(auth).send(body);
const upload = (ticket, bytes, contentType = 'image/png') =>
  request(app).put(pathOf(ticket.uploadUrl)).set('Content-Type', contentType).send(bytes);

test('a ticket says where to PUT the image and where it will be', async () => {
  const res = await sign({ kind: 'avatar', contentType: 'image/webp' });
  assert.equal(res.status, 201);
  assert.equal(res.body.method, 'PUT');
  assert.deepEqual(res.body.headers, { 'Content-Type': 'image/webp' });
  assert.equal(res.body.maxBytes, 5 * 1024 * 1024);
  assert.match(res.body.uploadUrl, /^http:\/\/localhost:5173\/api\/uploads\/[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.match(res.body.url, new RegExp(`^http://localhost:5173/api/uploads/files/avatar/${USER_ID}/[0-9a-f]{24}\\.webp$`));
  assert.ok(new Date(res.body.expiresAt) > new Date());

  assert.equal((await sign({ kind: 'banner', contentType: 'image/gif' })).status, 400);
});

test('the image is saved once, then served from its url', async () => {
  const { body: ticket } = await sign();
  const res = await upload(ticket, PNG);
  assert.equal(res.status, 201);
  assert.equal(res.body.url, ticket.url);
  assert.deepEqual(await readFile(path.join(dir, pathOf(ticket.url).replace('/api/uploads/files/', ''))), PNG);

  const image = await request(app).get(pathOf(ticket.url));
  assert.equal(image.status, 200);
  assert.equal(image.headers['content-type'], 'image/png');
  assert.match(image.headers['cache-control'], /immutable/);
  assert.equal(image.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(image.body, PNG);

  const again = await upload(ticket, PNG);
  assert.equal(again.status, 409, 'a ticket works once, so it cannot replace the image');
  assert.equal((await request(app).get('/api/uploads/files/item/nobody/missing.png')).status, 404);
});

test('only the promised type of image is accepted', async () => {
  const { body: ticket } = await sign();
  const wrongType = await upload(ticket, PNG, 'image/jpeg');
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.error, 'Send the image with Content-Type: image/png, the type the ticket was made for');

  const fake = await upload(ticket, Buffer.from('<script>alert(1)</script>'));
  assert.equal(fake.status, 400);
  assert.equal(fake.body.error, 'That file is not a image/png image');

  assert.equal((await upload(ticket, Buffer.alloc(0))).status, 400);
  assert.equal((await upload(ticket, PNG)).status, 201, 'refused attempts leave the ticket usable');
});

test('images over 5 MB are refused', async () => {
  const { body: ticket } = await sign();
  const huge = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  const res = await upload(ticket, huge);
  assert.equal(res.status, 413);
  assert.equal(res.body.code, 'TOO_LARGE');
});

test('tickets and login tokens are not interchangeable, and tickets cannot be forged', async () => {
  const { body: ticket } = await sign();
  const ticketToken = pathOf(ticket.uploadUrl).split('/').at(-1);

  const asLogin = await request(app).get('/api/users/me').set('Authorization', `Bearer ${ticketToken}`);
  assert.equal(asLogin.status, 401);

  const loginToken = auth.Authorization.split(' ')[1];
  for (const bad of [loginToken, 'garbage', `${ticketToken.slice(0, -2)}xx`]) {
    const res = await request(app).put(`/api/uploads/${bad}`).set('Content-Type', 'image/png').send(PNG);
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.code, 'UPLOAD_TICKET_INVALID');
  }
});

test('deleting an account removes its uploads', async () => {
  const { body: ticket } = await sign({ kind: 'cover', contentType: 'image/png' });
  await upload(ticket, PNG);
  const folder = path.join(dir, 'cover', USER_ID);
  await access(folder);

  await deleteUserUploads(USER_ID);
  await assert.rejects(access(folder));
});

test('item, avatar and cover fields accept uploaded images', async () => {
  const { imageUrl } = await import('../src/lib/schemas.js');
  assert.ok(imageUrl.safeParse(`http://localhost:5173/api/uploads/files/item/${USER_ID}/a.png`).success);
  assert.ok(imageUrl.safeParse('https://example.com/chips.png').success);
  assert.equal(imageUrl.safeParse('http://example.com/chips.png').success, false);
});
