import * as adminService from './admin.service.js';

export async function listUsers(req, res) {
  res.json(await adminService.listUsers(req.valid.query));
}

export async function ban(req, res) {
  res.json(await adminService.banUser(req.userId, req.userRole, req.valid.params.username, req.valid.body));
}

export async function unban(req, res) {
  res.json(await adminService.unbanUser(req.userId, req.valid.params.username));
}

export async function setRole(req, res) {
  res.json(await adminService.setRole(req.userId, req.valid.params.username, req.valid.body.role));
}

export async function listLog(req, res) {
  res.json(await adminService.listLog(req.valid.query));
}
