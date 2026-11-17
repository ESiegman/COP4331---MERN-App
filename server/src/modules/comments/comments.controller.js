import * as commentsService from './comments.service.js';

export async function listComments(req, res) {
  const { rankingId } = req.valid.params;
  res.json(await commentsService.listComments(req.userId, rankingId, req.valid.query));
}

export async function addComment(req, res) {
  const { rankingId } = req.valid.params;
  res.status(201).json(await commentsService.addComment(req.userId, rankingId, req.valid.body.body));
}

export async function editComment(req, res) {
  const { commentId } = req.valid.params;
  res.json(await commentsService.editComment(req.userId, commentId, req.valid.body.body));
}

export async function deleteComment(req, res) {
  await commentsService.deleteComment(req.userId, req.valid.params.commentId, { role: req.userRole, reason: req.valid.body.reason });
  res.status(204).end();
}
