const User = require('../models/User');
const { createToken } = require('../middleware/auth');

// POST /api/users
// Body: { firstName, lastName, login, password, email }
// 201: { message, token, user }   409: { error } if the login is taken
exports.createUser = async (req, res, next) => {
  try {
    const { firstName = '', lastName = '', login, password, email = '' } = req.body || {};

    if (!login || !password) {
      return res.status(400).json({ error: 'login and password are required' });
    }

    if (await User.exists({ login: String(login) })) {
      return res.status(409).json({ error: 'A user with that login already exists' });
    }

    // The model hashes the password before saving
    const user = await User.create({
      firstName: String(firstName),
      lastName: String(lastName),
      login: String(login),
      password: String(password),
      email: String(email),
    });

    res.status(201).json({
      message: 'User registered successfully',
      token: createToken(user),
      user,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/:userId
// 200: the user   404: { error }
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
};
