'use strict';

const REDACTION_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /Bearer [A-Za-z0-9._-]{20,}/g,
  /bot:[0-9]+:[A-Za-z0-9_-]{30,}/g,
  /eyJ[A-Za-z0-9._-]{20,}/g,
];

let installed = false;

function redact(value) {
  return REDACTION_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
}

function installLogRedaction() {
  if (installed) return;
  installed = true;

  ['error', 'warn', 'log'].forEach((method) => {
    const original = console[method];
    console[method] = function redactedConsoleMethod(...args) {
      return original.apply(console, args.map((arg) => (typeof arg === 'string' ? redact(arg) : arg)));
    };
  });
}

module.exports = { installLogRedaction };
