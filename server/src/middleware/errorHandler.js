exports.notFound = (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Express only treats this as an error handler if it has all four arguments
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }

  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }

  // Duplicate key, e.g. two registrations with the same login at once
  if (err.code === 11000) {
    return res.status(409).json({ error: 'A user with that login already exists' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
