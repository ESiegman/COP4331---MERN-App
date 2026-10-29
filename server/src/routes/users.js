const express = require('express');
const users = require('../controllers/usersController');
const cards = require('../controllers/cardsController');
const validateObjectId = require('../middleware/validateObjectId');
const { requireAuth, requireSelf } = require('../middleware/auth');

const router = express.Router();

router.param('userId', validateObjectId);

// POST /api/users (register, open to everyone)
router.post('/', users.createUser);

// Everything below needs a token for this same user
router.get('/:userId', requireAuth, requireSelf, users.getUser);
router.get('/:userId/cards', requireAuth, requireSelf, cards.listUserCards);
router.post('/:userId/cards', requireAuth, requireSelf, cards.createCard);

module.exports = router;
