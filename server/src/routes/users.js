const express = require('express');
const users = require('../controllers/usersController');

const router = express.Router();

// POST /api/users (register)
router.post('/', users.createUser);

module.exports = router;
