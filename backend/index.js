const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const marketRoutes = require('./routes/market');
const botRoutes    = require('./routes/bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/market', marketRoutes);
app.use('/api/bot',    botRoutes);

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
