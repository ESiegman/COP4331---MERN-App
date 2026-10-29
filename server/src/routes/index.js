const express = require('express');

const router = express.Router();

// GET /api/health
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));

module.exports = router;
