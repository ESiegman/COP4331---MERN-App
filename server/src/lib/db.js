import mongoose from 'mongoose';
import { env } from '../config/env.js';

// Queries made inside withTransaction() join the transaction on their own, no { session } to pass around
mongoose.set('transactionAsyncLocalStorage', true);

// db/setup.js owns the collections, validators and indexes, so Mongoose must not create any
export const connectDb = (uri = env.MONGODB_URI) =>
  mongoose.connect(uri, { autoIndex: false, autoCreate: false });

export const disconnectDb = () => mongoose.disconnect();

// Runs fn so that every write in it commits together or not at all. Use it whenever one request
// touches more than one document, for example a like plus the ranking's likeCount.
export const withTransaction = (fn) => mongoose.connection.transaction(fn);

// Pass as the options of an update that only moves a counter (likeCount, commentCount,
// rankingCount), so updatedAt keeps meaning "the owner last edited this"
export const KEEP_UPDATED_AT = { timestamps: false };
