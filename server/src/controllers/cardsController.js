const Card = require('../models/Card');

const EDITABLE_FIELDS = ['playerName', 'teamName', 'cardValue', 'publisher', 'card'];

function pickEditable(body = {}) {
  const fields = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Loads the card and checks it belongs to the logged-in user.
// Sends the 404/403 itself and returns null if the request can't continue.
async function findOwnCard(req, res) {
  const card = await Card.findById(req.params.cardId);

  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return null;
  }
  if (card.userId !== req.userId) {
    res.status(403).json({ error: 'You can only access your own cards' });
    return null;
  }
  return card;
}

// GET /api/users/:userId/cards?search=text
// 200: array of the user's cards. search matches playerName or teamName, case-insensitive.
exports.listUserCards = async (req, res, next) => {
  try {
    const filter = { userId: req.params.userId };
    const search = String(req.query.search || '').trim();

    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ playerName: pattern }, { teamName: pattern }];
    }

    const cards = await Card.find(filter).sort({ playerName: 1 });
    res.status(200).json(cards);
  } catch (err) {
    next(err);
  }
};

// POST /api/users/:userId/cards
// Body: { playerName, teamName, cardValue, publisher, card }
// 201: the new card
exports.createCard = async (req, res, next) => {
  try {
    const card = await Card.create({ ...pickEditable(req.body), userId: req.params.userId });
    res.status(201).json(card);
  } catch (err) {
    next(err);
  }
};

// GET /api/cards/:cardId
// 200: the card   403: someone else's card   404: no such card
exports.getCard = async (req, res, next) => {
  try {
    const card = await findOwnCard(req, res);
    if (card) res.status(200).json(card);
  } catch (err) {
    next(err);
  }
};

// PUT /api/cards/:cardId
// Body: any of { playerName, teamName, cardValue, publisher, card }
// 200: the updated card
exports.updateCard = async (req, res, next) => {
  try {
    const card = await findOwnCard(req, res);
    if (!card) return;

    card.set(pickEditable(req.body));
    await card.save();
    res.status(200).json(card);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cards/:cardId
// 200: { message }
exports.deleteCard = async (req, res, next) => {
  try {
    const card = await findOwnCard(req, res);
    if (!card) return;

    await card.deleteOne();
    res.status(200).json({ message: 'Card deleted' });
  } catch (err) {
    next(err);
  }
};
