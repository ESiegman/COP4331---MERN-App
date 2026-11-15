import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { outbox } from '../src/integrations/email.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { AuthToken, User } from '../src/models/index.js';

// Runs against a real database that db/setup.js has prepared, so the validators and unique
// indexes are part of the test. Skipped unless MONGODB_URI is set, for example:
//   MONGODB_URI='mongodb://app:apppassword@localhost:27017/app?directConnection=true' npm test
// It only creates accounts named t_<random> and deletes them afterwards.

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run (see the top of this file)';

describe('sign-up, login and account against a real database', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex'); // random, because test files run at the same time
  const username = `t_${run}`;
  const email = `${username}@example.com`;
  const password = 'correct horse battery';
  const newPassword = 'staple staple staple';
  let auth;

  const post = (path, body) => request(app).post(`/api/auth${path}`).send(body);
  const tokenInLastEmail = () =>
    new URL(outbox.at(-1).text.match(/https?:\S+/)[0]).searchParams.get('token');

  before(() => connectDb());

  after(async () => {
    const users = await User.find({ username: { $regex: `^t_${run}` } }).select('_id');
    const ids = users.map((user) => user._id);
    await AuthToken.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await disconnectDb();
  });

  test('register creates an unverified user and emails a link', async () => {
    const res = await post('/register', { username: username.toUpperCase(), email: ` ${email} `, password });
    assert.equal(res.status, 201);
    assert.equal(res.body.token, undefined);

    const user = await User.findOne({ username }).select('+passwordHash');
    assert.equal(user.email, email);
    assert.equal(user.emailVerified, false);
    assert.match(user.passwordHash, /^\$2[aby]\$10\$/);
    assert.equal(outbox.at(-1).to, email);
  });

  test('the same email or username in another case is refused with 409', async () => {
    const sameEmail = await post('/register', { username: `${username}_2`, email: email.toUpperCase(), password });
    assert.equal(sameEmail.status, 409);
    assert.equal(sameEmail.body.error, 'Email already in use');

    const sameName = await post('/register', { username: username.toUpperCase(), email: `x${email}`, password });
    assert.equal(sameName.status, 409);
    assert.equal(sameName.body.error, 'Username already taken');
  });

  test('if the token cannot be saved, the user is not saved either', async (t) => {
    const name = `${username}_tx`;
    t.mock.method(AuthToken, 'create', async () => {
      throw new Error('simulated failure');
    });
    const res = await post('/register', { username: name, email: `${name}@example.com`, password });
    assert.equal(res.status, 500);
    assert.equal(await User.exists({ username: name }), null);
  });

  test('login is refused until the email is verified', async () => {
    const res = await post('/login', { email, password });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
  });

  test('the emailed link verifies the account and logs in, once', async () => {
    const token = tokenInLastEmail();

    const res = await post('/verify-email', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.emailVerified, true);
    assert.equal(res.body.user.passwordHash, undefined);
    assert.ok(res.body.token);

    const again = await post('/verify-email', { token });
    assert.equal(again.status, 400);
  });

  test('login answers a token for the right password and 401 for a wrong one', async () => {
    const wrong = await post('/login', { email, password: 'not the password' });
    assert.equal(wrong.status, 401);

    const unknown = await post('/login', { email: `nobody_${email}`, password });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error, wrong.body.error);

    const res = await post('/login', { email: email.toUpperCase(), password });
    assert.equal(res.status, 200);
    auth = { Authorization: `Bearer ${res.body.token}` };
  });

  test('GET /users/me returns the account without secrets', async () => {
    const res = await request(app).get('/api/users/me').set(auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.username, username);
    assert.deepEqual(res.body.notificationPrefs, { newComment: true, newRanking: true, newLike: false });
    assert.equal('passwordHash' in res.body, false);
    assert.equal('pushTokens' in res.body, false);
  });

  test('PATCH /users/me changes only what is sent, and null clears a field', async () => {
    const set = await request(app)
      .patch('/api/users/me')
      .set(auth)
      .send({ displayName: '  Tester ', bio: 'hello', notificationPrefs: { newLike: true } });
    assert.equal(set.status, 200);
    assert.equal(set.body.displayName, 'Tester');
    assert.deepEqual(set.body.notificationPrefs, { newComment: true, newRanking: true, newLike: true });

    const cleared = await request(app).patch('/api/users/me').set(auth).send({ displayName: null });
    assert.equal(cleared.status, 200);
    assert.equal('displayName' in cleared.body, false);
    assert.equal(cleared.body.bio, 'hello');

    // Unset in the database, not stored as null (which the validator would reject)
    const raw = await User.collection.findOne({ username });
    assert.equal('displayName' in raw, false);
  });

  test('forgot-password answers the same for known and unknown emails', async () => {
    const sentBefore = outbox.length;
    const unknown = await post('/forgot-password', { email: `nobody_${email}` });
    assert.equal(unknown.status, 202);
    assert.equal(outbox.length, sentBefore);

    const known = await post('/forgot-password', { email });
    assert.equal(known.status, 202);
    assert.deepEqual(known.body, unknown.body);
    assert.equal(outbox.length, sentBefore + 1);
  });

  test('the reset link sets a new password, once', async () => {
    const token = tokenInLastEmail();

    const res = await post('/reset-password', { token, password: newPassword });
    assert.equal(res.status, 200);
    assert.equal((await post('/reset-password', { token, password })).status, 400);

    assert.equal((await post('/login', { email, password })).status, 401);
    assert.equal((await post('/login', { email, password: newPassword })).status, 200);
  });

  test('resend-verification sends nothing to an account that is already verified', async () => {
    const sentBefore = outbox.length;
    const res = await post('/resend-verification', { email });
    assert.equal(res.status, 202);
    assert.equal(outbox.length, sentBefore);
  });

  test('Mongoose created no indexes of its own: db/setup.js owns them', async () => {
    const names = (await User.collection.indexes()).map((index) => index.name).sort();
    assert.deepEqual(names, ['_id_', 'email_1', 'username_1']);
  });
});
