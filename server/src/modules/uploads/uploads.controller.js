import * as uploadsService from './uploads.service.js';

export async function signImageUpload(req, res) {
  res.status(201).json(await uploadsService.signImageUpload(req.userId, req.valid.body));
}
