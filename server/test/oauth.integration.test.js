import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/lib/db.js';
import { signToken } from '../src/lib/jwt.js';
import { AuthToken, OAuthAccount, User } from '../src/models/index.js';
import { fakeProviders, signIn } from './fakeOAuth.js';

// Log in with Google and Discord, and linking them, against a real database with the providers
// faked. Skipped unless MONGODB_URI is set (see auth.integration.test.js). Everything it makes
// uses t_<random> emails, usernames and provider ids, and is deleted afterwards.

const skip = process.env.MONGODB_URI ? false : 'set MONGODB_URI to run';

describe('Google and Discord login against a real database', { skip }, () => {
  const app = createApp();
  const run = randomBytes(4).toString('hex');
  const email = (name) => `t_${run}_${name}@example.com`;
  const id = (name) => `t_${run}_${name}`;

  // What the fake Google and Discord say about each code the tests send
  const google = (name, extra = {}) => ({ sub: id(name), email: email(name), email_verified: true, name: `T ${run} ${name}`, ...extra });
  const discord = (name, extra = {}) => ({ id: id(name), username: id(name), global_name: `T ${run} ${name}`, avatar: null, email: email(name), verified: true, ...extra });
  const people = {
    adaGoogle: google('ada', { picture: 'https://lh3.googleusercontent.com/a/ada' }),
    adaGoogleAgain: google('ada'),
    adaDiscord: discord('ada'),
    otherAda: google('ada2', { name: `T ${run} ada` }),
    unverified: discord('unverified', { verified: false }),
    squatted: google('squatted'),
    bobDiscord: discord('bob'),
    bobDiscordOther: discord('bob_other'),
  };

  const login = (provider, code) => request(app).post(`/api/auth/oauth/${provider}`).send(signIn(code));
  const as = async (userId) => ({ Authorization: `Bearer ${await signToken(userId)}` });

  before(() => connectDb());
  beforeEach((t) => fakeProviders(t, people));

  after(async () => {
    const users = await User.find({ email: { $regex: `^t_${run}_` } }).select('_id');
    const ids = users.map((user) => user._id);
    await OAuthAccount.deleteMany({ $or: [{ userId: { $in: ids } }, { providerUserId: { $regex: `^t_${run}_` } }] });
    await AuthToken.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    await disconnectDb();
  });

  let ada;

  test('the first Google login creates a verified account with no password, named after the person', async () => {
    const res = await login('google', 'adaGoogle');
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    ada = res.body.user;
    assert.equal(ada.username, `t_${run}_ada`);
    assert.equal(ada.email, email('ada'));
    assert.equal(ada.emailVerified, true);
    assert.equal(ada.displayName, `T ${run} ada`);
    assert.equal(ada.avatarUrl, 'https://lh3.googleusercontent.com/a/ada');

    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${res.body.token}`);
    assert.equal(me.body.hasPassword, false);
    assert.deepEqual(me.body.linkedAccounts.map(({ provider, email: linked }) => [provider, linked]), [['google', email('ada')]]);
  });

  test('logging in again with the same Google account finds the same user', async () => {
    const res = await login('google', 'adaGoogleAgain');
    assert.equal(res.status, 200);
    assert.equal(res.body.user._id, ada._id);
    assert.equal(await User.countDocuments({ email: email('ada') }), 1);
  });

  test('a Discord account with the same verified email is linked to that user', async () => {
    const res = await login('discord', 'adaDiscord');
    assert.equal(res.status, 200);
    assert.equal(res.body.user._id, ada._id);
    assert.deepEqual((await OAuthAccount.find({ userId: ada._id }).sort({ provider: 1 })).map((a) => a.provider), ['discord', 'google']);
  });

  test('someone else with the same name gets a username with a number on the end', async () => {
    const res = await login('google', 'otherAda');
    assert.equal(res.status, 200);
    assert.match(res.body.user.username, new RegExp(`^t_${run}_ada\\d{2,4}$`));
  });

  test('without a verified email nothing is created', async () => {
    const res = await login('discord', 'unverified');
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'OAUTH_EMAIL_UNVERIFIED');
    assert.equal(await User.exists({ email: email('unverified') }), null);
    assert.equal(await OAuthAccount.exists({ providerUserId: id('unverified') }), null);
  });

  test('an expired code is a 400 and changes nothing', async () => {
    const res = await login('google', 'not-a-code');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'OAUTH_CODE_INVALID');
  });

  test('an unverified sign-up with the same email is taken over by the Google owner, and its password removed', async () => {
    const squatter = await request(app)
      .post('/api/auth/register')
      .send({ username: id('squat'), email: email('squatted'), password: 'squatter password' });
    assert.equal(squatter.status, 201);

    const res = await login('google', 'squatted');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, id('squat'));
    assert.equal(res.body.user.emailVerified, true);

    const user = await User.findOne({ email: email('squatted') }).select('+passwordHash');
    assert.equal(user.passwordHash, null);
    assert.equal(await AuthToken.exists({ userId: user._id, type: 'verify_email' }), null);
    const oldPassword = await request(app).post('/api/auth/login').send({ email: email('squatted'), password: 'squatter password' });
    assert.equal(oldPassword.status, 401);
  });

  test('a logged-in user links Discord once, and an account can belong to only one user', async () => {
    const bob = await User.create({
      username: id('bob'),
      email: email('bob_password'),
      emailVerified: true,
      passwordHash: await bcrypt.hash('bob password', 4),
    });
    const auth = await as(bob._id);
    const link = (code) => request(app).post('/api/users/me/oauth/discord').set(auth).send(signIn(code));

    const linked = await link('bobDiscord');
    assert.equal(linked.status, 201);
    assert.equal(linked.body.provider, 'discord');
    assert.equal(linked.body.email, email('bob'), 'the Discord email need not match the account');
    assert.ok(linked.body.linkedAt);

    assert.equal((await link('bobDiscord')).body.error, 'This Discord account is already linked to you');
    const second = await link('bobDiscordOther');
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'You already have a Discord account linked. Unlink it first.');

    const adasDiscord = await link('adaDiscord');
    assert.equal(adasDiscord.status, 409);
    assert.equal(adasDiscord.body.error, 'This Discord account is linked to a different user');

    // and logging in with it now reaches Bob, whose own email differs
    const viaDiscord = await login('discord', 'bobDiscord');
    assert.equal(viaDiscord.body.user._id, String(bob._id));
  });

  test('unlinking: never the only way in, 404 when not linked, otherwise it is gone', async () => {
    const adaAuth = await as(ada._id);
    const unlink = (auth, provider) => request(app).delete(`/api/users/me/oauth/${provider}`).set(auth);

    // Ada has Google and Discord and no password: one can go, the last one cannot
    assert.equal((await unlink(adaAuth, 'discord')).status, 204);
    assert.equal((await unlink(adaAuth, 'discord')).status, 404);
    const last = await unlink(adaAuth, 'google');
    assert.equal(last.status, 409);
    assert.match(last.body.error, /only way into this account/);
    assert.ok(await OAuthAccount.exists({ userId: ada._id, provider: 'google' }));

    // Bob has a password, so his only linked account can go
    const bob = await User.findOne({ username: id('bob') });
    assert.equal((await unlink(await as(bob._id), 'discord')).status, 204);
    assert.equal(await OAuthAccount.exists({ userId: bob._id }), null);
  });
});
