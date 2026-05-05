'use strict';

/**
 * KORVIN Sanitizer
 * Strips prompt injection, command escalation attempts, and oversized payloads
 * from all user input before it reaches any skill or LLM call.
 */

const MAX_INPUT_LENGTH = 2000;

// Patterns that indicate prompt injection or privilege escalation attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  /you\s+are\s+now\s+(a\s+)?(?!korvin)/i,
  /disregard\s+(your\s+)?(previous\s+)?instructions?/i,
  /system\s*:\s*you/i,
  /\bDAN\b/,
  /jailbreak/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+(restrictions|limits|rules)/i,
  /pretend\s+you\s+(are|have)\s+no\s+(restrictions|limits|rules)/i,
  /override\s+(safety|security|restrictions?|rules?)/i,
  /sudo\s+mode/i,
  /developer\s+mode/i,
];

// Shell/command injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$](?!\s*\w+\s*=)/,   // shell operators (loose — only flag in non-assignment context)
  /\.\.[\/\\]/,               // path traversal
  /<script[\s>]/i,            // XSS
  /eval\s*\(/i,
  /exec\s*\(/i,
  /require\s*\(\s*['"`]child_process/i,
];

/**
 * Sanitize a raw user input string.
 * Returns { safe: true, value } or { safe: false, reason }.
 *
 * @param {string} input
 * @returns {{ safe: boolean, value?: string, reason?: string }}
 */
function sanitize(input) {
  if (typeof input !== 'string') {
    return { safe: false, reason: 'Input must be a string.' };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { safe: false, reason: 'Input is empty.' };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return { safe: false, reason: `Input exceeds ${MAX_INPUT_LENGTH} character limit (got ${trimmed.length}).` };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: `Input flagged for prompt injection pattern: ${pattern}` };
    }
  }

  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { safe: false, reason: `Input flagged for command injection pattern: ${pattern}` };
    }
  }

  return { safe: true, value: trimmed };
}

/**
 * Sanitize an object's string fields recursively.
 */
function sanitizeObject(obj, fields) {
  if (typeof obj !== 'object' || obj === null) {
    return { safe: false, reason: 'Expected an object.' };
  }

  const keys = fields || Object.keys(obj);
  const sanitized = { ...obj };

  for (const key of keys) {
    if (typeof obj[key] === 'string') {
      const result = sanitize(obj[key]);
      if (!result.safe) {
        return { safe: false, reason: result.reason, field: key };
      }
      sanitized[key] = result.value;
    }
  }

  return { safe: true, value: sanitized };
}

function sanitizeInput(rawText) {
  return sanitize(rawText);
}

module.exports = { sanitize, sanitizeObject, sanitizeInput, MAX_INPUT_LENGTH };
