'use strict';

const assert = require('assert');
const { checkRateLimit } = require('../src/security/rate-limiter');

function testFirstNRequestsAllowed() {
  const maxRequests = 3;

  for (let i = 0; i < maxRequests; i += 1) {
    const result = checkRateLimit('allowed-user', maxRequests, 60);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.retryAfterSeconds, 0);
  }
}

function testRequestNPlusOneBlocked() {
  const maxRequests = 2;

  checkRateLimit(12345, maxRequests, 60);
  checkRateLimit(12345, maxRequests, 60);
  const result = checkRateLimit(12345, maxRequests, 60);

  assert.strictEqual(result.allowed, false);
  assert.ok(result.retryAfterSeconds > 0);
}

function testRequestsAllowedAfterWindowExpires() {
  const originalNow = Date.now;
  let now = 1000;

  try {
    Date.now = () => now;

    assert.strictEqual(checkRateLimit('window-user', 2, 1).allowed, true);
    assert.strictEqual(checkRateLimit('window-user', 2, 1).allowed, true);
    assert.strictEqual(checkRateLimit('window-user', 2, 1).allowed, false);

    now = 2101;
    assert.strictEqual(checkRateLimit('window-user', 2, 1).allowed, true);
  } finally {
    Date.now = originalNow;
  }
}

testFirstNRequestsAllowed();
testRequestNPlusOneBlocked();
testRequestsAllowedAfterWindowExpires();

console.log('All tests passed');
