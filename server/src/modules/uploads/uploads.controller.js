import * as uploadsService from './uploads.service.js';

export async function signImageUpload(req, res) {
  res.status(201).json(await uploadsService.signImageUpload(req.userId, req.valid.body));
}

export async function storeImageUpload(req, res) {
  // "image/png; charset=binary" and "IMAGE/PNG" both mean image/png
  const contentType = (req.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  res.status(201).json(await uploadsService.storeImageUpload(req.valid.params.ticket, contentType, req.body));
}
