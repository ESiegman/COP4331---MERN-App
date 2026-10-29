const mongoose = require('mongoose');

// Used with router.param() so a malformed id gets a 400 instead of a database error
module.exports = (req, res, next, value, name) => {
  if (!mongoose.isValidObjectId(value)) {
    return res.status(400).json({ error: `Invalid ${name}: ${value}` });
  }
  next();
};
