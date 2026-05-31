'use strict';

const requestsByUser = new Map();

function cleanup(now, windowMs) {
  const cutoff = now - windowMs;

  for (const [userId, timestamps] of requestsByUser.entries()) {
    const recent = timestamps.filter((timestamp) => timestamp > cutoff);
    if (recent.length === 0) {
      requestsByUser.delete(userId);
    } else if (recent.length !== timestamps.length) {
      requestsByUser.set(userId, recent);
    }
  }
}

function checkRateLimit(userId, maxRequests = 20, windowSeconds = 60) {
  const key = String(userId ?? 'anonymous');
  const windowMs = windowSeconds * 1000;
  const now = Date.now();

  cleanup(now, windowMs);

  const timestamps = requestsByUser.get(key) || [];
  if (timestamps.length >= maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((timestamps[0] + windowMs - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  requestsByUser.set(key, timestamps);

  return { allowed: true, retryAfterSeconds: 0 };
}

module.exports = { checkRateLimit };
