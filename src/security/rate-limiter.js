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

function runDb(db, sql, params = []) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('checkRateLimitDb requires a SQLite db instance with prepare().');
  }
  return db.prepare(sql).run(...params);
}

function getDb(db, sql, params = []) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('checkRateLimitDb requires a SQLite db instance with prepare().');
  }
  return db.prepare(sql).get(...params);
}

function checkRateLimitDb(db, userId, maxRequests = 20, windowSeconds = 60) {
  const key = String(userId ?? 'anonymous');
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - windowSeconds;

  runDb(db, 'CREATE TABLE IF NOT EXISTS rate_limit (user_id TEXT, ts INTEGER)');
  runDb(db, 'DELETE FROM rate_limit WHERE ts <= ?', [cutoff]);

  const countRow = getDb(
    db,
    'SELECT COUNT(*) AS count FROM rate_limit WHERE user_id = ?',
    [key]
  );
  const count = countRow ? countRow.count : 0;

  if (count >= maxRequests) {
    const oldestRow = getDb(
      db,
      'SELECT MIN(ts) AS oldest FROM rate_limit WHERE user_id = ?',
      [key]
    );
    const oldest = oldestRow && oldestRow.oldest ? oldestRow.oldest : now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, oldest + windowSeconds - now)
    };
  }

  runDb(db, 'INSERT INTO rate_limit (user_id, ts) VALUES (?, ?)', [key, now]);
  return { allowed: true, retryAfterSeconds: 0 };
}

module.exports = { checkRateLimit, checkRateLimitDb };
