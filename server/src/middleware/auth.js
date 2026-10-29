const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/auth');

exports.createToken = (user) =>
  jwt.sign({ sub: String(user._id) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Protected routes need the header  Authorization: Bearer <token>
// On success req.userId is the logged-in user's id.
exports.requireAuth = (req, res, next) => {
  const [scheme, token] = (req.get('Authorization') || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// For /api/users/:userId routes. Run after requireAuth.
exports.requireSelf = (req, res, next) => {
  if (req.params.userId !== req.userId) {
    return res.status(403).json({ error: 'You can only access your own account' });
  }
  next();
};
