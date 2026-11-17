import * as authService from '../auth/auth.service.js';
import * as rankingsService from '../rankings/rankings.service.js';
import * as templatesService from '../templates/templates.service.js';
import * as usersService from './users.service.js';

export async function getAccount(req, res) {
  res.json(await usersService.getAccount(req.userId));
}

export async function updateAccount(req, res) {
  const user = await usersService.updateAccount(req.userId, req.valid.body);
  res.json(user.toAccount());
}

export async function addPushToken(req, res) {
  await usersService.addPushToken(req.userId, req.valid.body.token);
  res.status(204).end();
}

export async function removePushToken(req, res) {
  await usersService.removePushToken(req.userId, req.valid.body.token);
  res.status(204).end();
}

export async function linkOAuthAccount(req, res) {
  const account = await authService.linkAccount(req.userId, req.valid.params.provider, req.valid.body);
  res.status(201).json(account);
}

export async function unlinkOAuthAccount(req, res) {
  await authService.unlinkAccount(req.userId, req.valid.params.provider);
  res.status(204).end();
}

export async function getProfile(req, res) {
  res.json(await usersService.getProfile(req.valid.params.username));
}

export async function listTemplates(req, res) {
  const owner = await usersService.findUserByUsername(req.valid.params.username);
  res.json(await templatesService.listByOwner(owner, req.userId, req.valid.query));
}

export async function listRankings(req, res) {
  const owner = await usersService.findUserByUsername(req.valid.params.username);
  res.json(await rankingsService.listByOwner(owner, req.userId, req.valid.query));
}
