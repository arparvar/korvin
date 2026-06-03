'use strict';

const path = require('path');

function writeResult(result) {
  process.stdout.write(JSON.stringify(result));
}

function exitWith(result, code) {
  writeResult(result);
  process.exit(code);
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });

  await new Promise((resolve) => {
    process.stdin.on('end', resolve);
  });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    exitWith({ ok: false, error: 'bad payload' }, 1);
    return;
  }

  const timeout = setTimeout(() => {
    exitWith({ ok: false, error: 'timeout' }, 1);
  }, 10000);

  try {
    const skillDir = path.resolve(payload.skillDir);
    const handlerPath = path.resolve(skillDir, payload.handlerRelPath);

    if (!handlerPath.startsWith(`${skillDir}${path.sep}`) || path.extname(handlerPath) !== '.js') {
      clearTimeout(timeout);
      exitWith({ ok: false, error: 'invalid handler path' }, 1);
      return;
    }

    let handler;
    try {
      handler = require(handlerPath);
    } catch (err) {
      clearTimeout(timeout);
      exitWith({ ok: false, error: `load failed: ${err.message}` }, 1);
      return;
    }

    if (!handler || typeof handler.run !== 'function') {
      clearTimeout(timeout);
      exitWith({ ok: false, error: 'no run function' }, 1);
      return;
    }

    try {
      const result = await handler.run(payload.message, payload.match || []);
      clearTimeout(timeout);
      exitWith({ ok: true, reply: String(result) }, 0);
    } catch (err) {
      clearTimeout(timeout);
      exitWith({ ok: false, error: `handler threw: ${err.message}` }, 1);
    }
  } catch (err) {
    clearTimeout(timeout);
    exitWith({ ok: false, error: `handler threw: ${err.message}` }, 1);
  }
}

main().catch(() => {
  exitWith({ ok: false, error: 'bad payload' }, 1);
});
