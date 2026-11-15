// Throw one of these anywhere (middleware, controller, service) and the error handler
// turns it into a JSON response: { error, code, details }.
export class HttpError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new HttpError(400, message, { code: 'BAD_REQUEST', details });

export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, message, { code: 'UNAUTHORIZED' });

export const forbidden = (message = 'You are not allowed to do that', code = 'FORBIDDEN') =>
  new HttpError(403, message, { code });

export const notFound = (what = 'Resource') =>
  new HttpError(404, `${what} not found`, { code: 'NOT_FOUND' });

export const conflict = (message) => new HttpError(409, message, { code: 'CONFLICT' });

// Placeholder for service functions that are wired up but not written yet
export const notImplemented = (what) =>
  new HttpError(501, `Not implemented yet: ${what}`, { code: 'NOT_IMPLEMENTED' });
