import { HttpError } from '../lib/errors.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
}

// Every error ends up here. Express 5 forwards rejected promises from async handlers on its own,
// so controllers and services just throw. Express only treats a function with all four
// arguments as an error handler.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON', code: 'BAD_REQUEST' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large', code: 'TOO_LARGE' });
  }

  // Mongoose rejected the document before it reached the database
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message, code: 'VALIDATION' });
  }

  // A unique index said no, for example two sign-ups racing for the same username
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern ?? {});
    const error = fields.length === 1 ? `That ${fields[0]} is already taken` : 'That already exists';
    return res.status(409).json({ error, code: 'CONFLICT' });
  }

  // Code 121 means a document failed the validator in db/setup.js: a model has drifted from it
  const reason = err.code === 121 ? 'Document rejected by the db/setup.js validator' : 'Unhandled error';
  req.log?.error({ err }, reason);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
}
