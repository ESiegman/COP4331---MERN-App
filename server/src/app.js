const express = require('express');
const morgan = require('morgan');
const apiRouter = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.json());

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
