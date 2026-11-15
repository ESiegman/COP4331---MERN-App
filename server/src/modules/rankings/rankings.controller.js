import * as rankingsService from './rankings.service.js';

export async function listFeed(req, res) {
  res.json(await rankingsService.listFeed(req.valid.query));
}

export async function listForTemplate(req, res) {
  const { templateId } = req.valid.params;
  res.json(await rankingsService.listForTemplate(req.userId, templateId, req.valid.query));
}

export async function communityRanking(req, res) {
  res.json(await rankingsService.communityRanking(req.userId, req.valid.params.templateId));
}

export async function startRanking(req, res) {
  const { ranking, created } = await rankingsService.startRanking(req.userId, req.valid.params.templateId);
  res.status(created ? 201 : 200).json(ranking);
}

export async function getRanking(req, res) {
  res.json(await rankingsService.getRanking(req.userId, req.valid.params.rankingId));
}

export async function saveRanking(req, res) {
  const { rankingId } = req.valid.params;
  res.json(await rankingsService.saveRanking(req.userId, rankingId, req.valid.body));
}

export async function deleteRanking(req, res) {
  await rankingsService.deleteRanking(req.userId, req.valid.params.rankingId);
  res.status(204).end();
}

export async function like(req, res) {
  res.json(await rankingsService.like(req.userId, req.valid.params.rankingId));
}

export async function unlike(req, res) {
  res.json(await rankingsService.unlike(req.userId, req.valid.params.rankingId));
}
