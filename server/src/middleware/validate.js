import { HttpError } from '../lib/errors.js';

const PARTS = ['params', 'query', 'body'];

// validate({ params, query, body }) checks each part of the request against a Zod schema.
// The parsed values (trimmed, coerced, defaults applied, unknown keys dropped) land on req.valid,
// and controllers read from there instead of req.body. Express 5 makes req.query read-only,
// which is why the parsed values are not written back onto the request parts themselves.
export const validate = (schemas) => (req, res, next) => {
  const valid = {};
  const details = [];

  for (const part of PARTS) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});

    if (result.success) {
      valid[part] = result.data;
      continue;
    }
    for (const issue of result.error.issues) {
      details.push({ in: part, field: issue.path.join('.'), message: issue.message });
    }
  }

  if (details.length > 0) {
    const [{ field, message }] = details;
    throw new HttpError(400, field ? `${field}: ${message}` : message, { code: 'VALIDATION', details });
  }

  req.valid = valid;
  next();
};
