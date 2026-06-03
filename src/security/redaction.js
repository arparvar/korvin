'use strict';

const util = require('util');

const SENSITIVE_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_API_KEY]'],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [REDACTED_TOKEN]'],
  [/\bbot:[0-9]+:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]'],
  [/\beyJ[A-Za-z0-9._-]{8,}/g, '[REDACTED_JWT]'],
  [/\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+/gi, '$1=[REDACTED_SECRET]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]'],
];

function redactText(value) {
  return SENSITIVE_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value || '')
  );
}

function stringifyForLog(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack || ''}`;
  }
  return util.inspect(value, { depth: 4, breakLength: 120 });
}

function redactForLog(value) {
  return redactText(stringifyForLog(value));
}

module.exports = { SENSITIVE_PATTERNS, redactText, redactForLog };
