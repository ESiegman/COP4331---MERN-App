const express = require('express');
const cards = require('../controllers/cardsController');
const validateObjectId = require('../middleware/validateObjectId');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.param('cardId', validateObjectId);
router.use(requireAuth);

// Ownership is checked in the controller
router.get('/:cardId', cards.getCard);
router.put('/:cardId', cards.updateCard);
router.delete('/:cardId', cards.deleteCard);

module.exports = router;
