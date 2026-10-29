const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    playerName: { type: String, required: [true, 'playerName is required'], trim: true },
    teamName: { type: String, default: '', trim: true },
    cardValue: { type: Number, default: 0, min: [0, 'cardValue cannot be negative'] },
    publisher: { type: String, default: '', trim: true },
    card: { type: String, default: '', trim: true },
    // Stored as a string, matching the seed data in db/setup.js
    userId: { type: String, required: true },
  },
  { collection: 'cards', versionKey: false },
);

module.exports = mongoose.model('Card', cardSchema);
