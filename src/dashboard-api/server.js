// src/dashboard/server.js
// Korvin Express Dashboard — localhost only, port 3000

'use strict';

require('../security/log-redact').installLogRedaction();

const express = require('express');
const systemRouter = require('./routes/system');
const { sendMessage, resetSession } = require('../openclaw/gateway');
const { checkRateLimit } = require('../security/rate-limiter');

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

app.post('/chat', async (req, res) => {
  const userId = req.ip || 'dashboard';
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });
  }

  const message = req.body && req.body.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const reply = await sendMessage(message, userId);
    return res.json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to process chat request' });
  }
});

app.post('/api/session/reset', async (req, res) => {
  const userId = req.ip || 'dashboard';
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) return res.status(429).json({ error: 'Too many requests' });
  const count = await resetSession(userId);
  return res.json({ cleared: count });
});

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
