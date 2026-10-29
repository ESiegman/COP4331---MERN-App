const User = require('../models/User');
const { createToken } = require('../middleware/auth');

// POST /api/auth/login
// Body: { login, password }
// 200: { token, user }   401: { error }
exports.login = async (req, res, next) => {
  try {
    const { login, password } = req.body || {};

    if (!login || !password) {
      return res.status(400).json({ error: 'login and password are required' });
    }

    // String() stops a body like {"login": {"$ne": null}} from becoming a query operator
    const user = await User.findOne({ login: String(login) }).select('+password');

    // Same message for a wrong login or a wrong password
    if (!user || !(await user.checkPassword(String(password)))) {
      return res.status(401).json({ error: 'Invalid login or password' });
    }

    res.status(200).json({ token: createToken(user), user });
  } catch (err) {
    next(err);
  }
};
