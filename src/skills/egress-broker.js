'use strict';

const net = require('net');
const http = require('http');
const { URL } = require('url');

const CONTROL_PORT = Number(process.env.KORVIN_EGRESS_CONTROL_PORT) || 4100;
const PROXY_PORT = Number(process.env.KORVIN_EGRESS_PROXY_PORT) || 4101;
const HOST = '127.0.0.1';
const tokens = new Map();

function sendJson(socket, payload) {
  socket.end(`${JSON.stringify(payload)}\n`);
}

function findToken(token) {
  const entry = tokens.get(token);
  if (!entry) return { reason: 'no-token' };
  if (Date.now() > entry.expiry) {
    tokens.delete(token);
    return { reason: 'expired', skillId: entry.skillId };
  }
  return { entry };
}

function parseProxyAuth(header) {
  if (!header || !/^Basic\s+/i.test(header)) return { skillId: 'unknown', token: '' };
  try {
    const decoded = Buffer.from(header.replace(/^Basic\s+/i, ''), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return { skillId: decoded || 'unknown', token: '' };
    return {
      skillId: decoded.slice(0, idx) || 'unknown',
      token: decoded.slice(idx + 1),
    };
  } catch (_) {
    return { skillId: 'unknown', token: '' };
  }
}

function normalizeHost(host) {
  if (!host) return '';
  let value = String(host).trim();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value.toLowerCase() : value.slice(1, end).toLowerCase();
  }
  return value.split(':')[0].toLowerCase();
}

function hostAllowed(host, allowlist) {
  const wanted = normalizeHost(host);
  return allowlist.some((entry) => normalizeHost(entry) === wanted);
}

function deny(socket, skillId, host, reason) {
  console.log(`[egress] DENY skill=${skillId || 'unknown'} host=${host || 'unknown'} reason=${reason}`);
  socket.end('HTTP/1.1 403 Forbidden\r\n\r\n', () => socket.destroy());
}

function allow(skillId, host) {
  console.log(`[egress] ALLOW skill=${skillId || 'unknown'} host=${host || 'unknown'}`);
}

function authorize(headers, host) {
  const auth = parseProxyAuth(headers['proxy-authorization']);
  const found = findToken(auth.token);
  if (!found.entry) {
    return { ok: false, skillId: auth.skillId || found.skillId, reason: found.reason };
  }
  if (!hostAllowed(host, found.entry.allowlist)) {
    return { ok: false, skillId: found.entry.skillId, reason: 'not-allowed' };
  }
  return { ok: true, skillId: found.entry.skillId };
}

function startControlServer() {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;

      let req;
      try {
        req = JSON.parse(buffer.slice(0, newline));
      } catch (_) {
        return sendJson(socket, { ok: false });
      }

      if (req.op === 'register' && req.token && req.skillId && Array.isArray(req.allowlist)) {
        tokens.set(String(req.token), {
          skillId: String(req.skillId),
          allowlist: req.allowlist.map(String),
          expiry: Date.now() + (Number(req.ttlMs) || 0),
        });
        return sendJson(socket, { ok: true });
      }

      if (req.op === 'revoke' && req.token) {
        tokens.delete(String(req.token));
        return sendJson(socket, { ok: true });
      }

      return sendJson(socket, { ok: false });
    });
  });
  server.listen(CONTROL_PORT, HOST);
  return server;
}

function requestTarget(req) {
  try {
    const parsed = new URL(req.url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 80,
      path: `${parsed.pathname}${parsed.search}`,
    };
  } catch (_) {
    const hostHeader = req.headers.host || '';
    return {
      host: normalizeHost(hostHeader),
      port: Number(String(hostHeader).split(':')[1]) || 80,
      path: req.url || '/',
    };
  }
}

function startProxyServer() {
  const server = http.createServer((req, res) => {
    const target = requestTarget(req);
    const auth = authorize(req.headers, target.host);
    if (!auth.ok) {
      return deny(req.socket, auth.skillId, target.host, auth.reason);
    }

    allow(auth.skillId, target.host);
    const headers = { ...req.headers };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];

    const upstream = http.request({
      host: target.host,
      port: target.port,
      method: req.method,
      path: target.path,
      headers,
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });

    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });

    req.pipe(upstream);
  });

  server.on('connect', (req, clientSocket, head) => {
    const [hostPart, portPart] = String(req.url || '').split(':');
    const host = normalizeHost(hostPart);
    const port = Number(portPart) || 443;
    const auth = authorize(req.headers, host);
    if (!auth.ok) return deny(clientSocket, auth.skillId, host, auth.reason);

    allow(auth.skillId, host);
    const upstream = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  server.listen(PROXY_PORT, HOST);
  return server;
}

function start() {
  return {
    control: startControlServer(),
    proxy: startProxyServer(),
  };
}

if (require.main === module) {
  start();
}

module.exports = { start };
