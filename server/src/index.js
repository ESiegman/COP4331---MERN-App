import express from 'express';
import mongoose from 'mongoose';

const port = process.env.PORT || 5000;
const app = express();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

await mongoose.connect(process.env.MONGODB_URI);
app.listen(port, () => console.log(`API listening on port ${port}`));
