import * as notificationsService from './notifications.service.js';

export async function listNotifications(req, res) {
  res.json(await notificationsService.listNotifications(req.userId, req.valid.query));
}

export async function markRead(req, res) {
  await notificationsService.markRead(req.userId, req.valid.params.notificationId);
  res.status(204).end();
}

export async function markAllRead(req, res) {
  await notificationsService.markAllRead(req.userId);
  res.status(204).end();
}
