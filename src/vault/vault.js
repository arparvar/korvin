'use strict';
const http = require('http');

const HOST = process.env.KORVIN_VAULT_HOST || '127.0.0.1';
const PORT = parseInt(process.env.KORVIN_VAULT_PORT || '4001', 10);
const VAULT_TOKEN = process.env.KORVIN_VAULT_TOKEN || '';

const ALLOWED_KEYS = new Set([
  'LITELLM_MASTER_KEY',
  'DEEPSEEK_API_KEY',
  'GEMINI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
]);

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405);
    return res.end('Method Not Allowed');
  }
  const token = req.headers['x-vault-token'];
  if (!VAULT_TOKEN || token !== VAULT_TOKEN) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  const match = req.url.match(/^\/secret\/([A-Z_]+)$/);
  if (!match) {
    res.writeHead(404);
    return res.end('Not Found');
  }
  const name = match[1];
  if (!ALLOWED_KEYS.has(name)) {
    res.writeHead(403);
    return res.end('Key not in allowlist');
  }
  const value = process.env[name] || '';
  if (!value) {
    res.writeHead(404);
    return res.end('Key not set');
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ key: name, value }));
});

server.listen(PORT, HOST, () => {
  console.log(`[Korvin vault] Listening on ${HOST}:${PORT}`);
});

module.exports = { server };
