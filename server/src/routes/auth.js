const express = require('express');
const auth = require('../controllers/authController');

const router = express.Router();

// POST /api/auth/login
router.post('/login', auth.login);

module.exports = router;
