'use strict';

/**
 * KORVIN Confirmation Gate
 * Requires explicit /confirm before any destructive or high-risk action executes.
 *
 * Risk levels:
 *   HIGH   — requires confirmation (patch, scan, delete, exec, write)
 *   LOW    — passes through immediately
 */

const crypto = require('crypto');

const pendingActions = new Map();

const RISK_MAP = {
  patch:      'HIGH',
  scan:       'HIGH',
  delete:     'HIGH',
  exec:       'HIGH',
  write:      'HIGH',
  research:   'LOW',
  status:     'LOW',
  log:        'LOW',
  help:       'LOW',
};

const TIMEOUT_MS = 5 * 60 * 1000;

function classifyRisk(action) {
  return RISK_MAP[action.toLowerCase()] || 'MEDIUM';
}

function generatePendingId() {
  return crypto.randomBytes(4).toString('hex');
}

function registerPending({ action, args, chatId, userId }) {
  const pendingId = generatePendingId();
  const timestamp = Date.now();

  const promise = new Promise((resolve, reject) => {
    pendingActions.set(pendingId, { action, args, chatId, userId, timestamp, resolve, reject });

    setTimeout(() => {
      if (pendingActions.has(pendingId)) {
        pendingActions.delete(pendingId);
        reject(new Error(`Action "${action}" [${pendingId}] expired after 5 minutes.`));
      }
    }, TIMEOUT_MS);
  });

  return { pendingId, promise };
}

function confirmAction(pendingId, userId) {
  const entry = pendingActions.get(pendingId);
  if (!entry) return { ok: false, message: `No pending action for \`${pendingId}\`. Expired or already handled.` };
  if (entry.userId !== userId) return { ok: false, message: 'Not authorized to confirm this action.' };
  pendingActions.delete(pendingId);
  entry.resolve();
  return { ok: true, message: `Action "${entry.action}" [${pendingId}] confirmed. Executing...` };
}

function cancelAction(pendingId, userId) {
  const entry = pendingActions.get(pendingId);
  if (!entry) return { ok: false, message: `No pending action for \`${pendingId}\`.` };
  if (entry.userId !== userId) return { ok: false, message: 'Not authorized to cancel this action.' };
  pendingActions.delete(pendingId);
  entry.reject(new Error(`Action "${entry.action}" [${pendingId}] cancelled by user.`));
  return { ok: true, message: `Action "${entry.action}" [${pendingId}] cancelled.` };
}

function listPending(chatId) {
  const now = Date.now();
  const results = [];
  for (const [pendingId, entry] of pendingActions.entries()) {
    if (entry.chatId === chatId) {
      results.push({ pendingId, action: entry.action, args: entry.args, elapsed: Math.round((now - entry.timestamp) / 1000) });
    }
  }
  return results;
}

async function confirmationGate({ action, args, chatId, userId, sendMessage, executor }) {
  const risk = classifyRisk(action);

  if (risk === 'LOW') {
    return executor();
  }

  if (risk === 'MEDIUM') {
    const warning = `⚠️ *KORVIN Warning*\nAction: \`${action}\`\nRisk: MEDIUM\nExecuting automatically — review output carefully.`;
    await sendMessage(chatId, warning);
    return executor();
  }

  // HIGH — intercept and require confirmation
  const { pendingId, promise } = registerPending({ action, args, chatId, userId });

  const prompt = [
    `🔐 *KORVIN Confirmation Required*`,
    `Action: \`${action}\``,
    `Args: \`${JSON.stringify(args)}\``,
    `Risk: HIGH`,
    ``,
    `Reply \`/confirm ${pendingId}\` to execute`,
    `Reply \`/cancel ${pendingId}\` to abort`,
    `Expires in 5 minutes.`,
  ].join('\n');

  await sendMessage(chatId, prompt);

  try {
    await promise;
    return executor();
  } catch (err) {
    await sendMessage(chatId, `❌ ${err.message}`);
  }
}

module.exports = { confirmationGate, confirmAction, cancelAction, listPending, classifyRisk };
