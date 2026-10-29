const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    login: { type: String, required: [true, 'login is required'], unique: true, trim: true },
    // Left out of query results unless asked for with .select('+password')
    password: { type: String, required: [true, 'password is required'], select: false },
    email: { type: String, default: '', trim: true },
  },
  { collection: 'users', versionKey: false },
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

userSchema.methods.checkPassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never send the password hash back in a response
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
