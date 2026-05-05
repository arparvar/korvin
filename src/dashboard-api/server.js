// src/dashboard/server.js
// Korvin Express Dashboard — localhost only, port 3000

'use strict';

const express = require('express');
const systemRouter = require('./routes/system');

const app = express();
const PORT = 3000;

// Localhost-only guard
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || '';
  const allowed = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (!allowed.includes(ip)) {
    return res.status(403).json({ error: 'Forbidden: localhost only' });
  }
  next();
});

app.use(express.json());

// Routes
app.use('/api/system', systemRouter);

// Health ping
app.get('/ping', (req, res) => res.json({ status: 'ok', service: 'korvin-dashboard' }));

// Start
function startDashboard() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`[Dashboard] Listening on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
    server.on('error', (err) => {
      console.error('[Dashboard] Failed to start:', err.message);
      resolve(null); // Non-fatal — bot continues without dashboard
    });
  });
}

module.exports = { startDashboard };