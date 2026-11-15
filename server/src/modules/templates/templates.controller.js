import * as templatesService from './templates.service.js';

export async function listTemplates(req, res) {
  res.json(await templatesService.listTemplates(req.valid.query));
}

export async function createTemplate(req, res) {
  res.status(201).json(await templatesService.createTemplate(req.userId, req.valid.body));
}

export async function getTemplate(req, res) {
  res.json(await templatesService.getTemplate(req.userId, req.valid.params.templateId));
}

export async function updateTemplate(req, res) {
  const { templateId } = req.valid.params;
  res.json(await templatesService.updateTemplate(req.userId, templateId, req.valid.body));
}

export async function deleteTemplate(req, res) {
  await templatesService.deleteTemplate(req.userId, req.valid.params.templateId);
  res.status(204).end();
}

export async function addItem(req, res) {
  const { templateId } = req.valid.params;
  res.status(201).json(await templatesService.addItem(req.userId, templateId, req.valid.body));
}

export async function updateItem(req, res) {
  const { templateId, itemId } = req.valid.params;
  res.json(await templatesService.updateItem(req.userId, templateId, itemId, req.valid.body));
}

export async function removeItem(req, res) {
  const { templateId, itemId } = req.valid.params;
  await templatesService.removeItem(req.userId, templateId, itemId);
  res.status(204).end();
}

export async function suggestItems(req, res) {
  res.json(await templatesService.suggestItems(req.valid.body));
}
