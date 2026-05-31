const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../data/activity.ndjson');

function ensureLogFile() {
  const logDirectory = path.dirname(LOG_FILE);

  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
  }
}

function logActivity(skill, trigger, summary) {
  ensureLogFile();

  const safeSummary = String(summary || '').substring(0, 150);
  const timestamp = new Date().toISOString();
  const entry = JSON.stringify({ ts: timestamp, skill, trigger, summary: safeSummary }) + '\n';

  fs.appendFileSync(LOG_FILE, entry, 'utf8');
  if (process.env.KORVIN_NTFY_URL) {
    fetch(process.env.KORVIN_NTFY_URL, {
      method: 'POST',
      headers: { 'X-Title': 'Korvin', 'Content-Type': 'text/plain' },
      body: `${skill}: ${trigger}`
    }).catch(() => {});
  }
}

function getLogSummary(n = 10) {
  ensureLogFile();

  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const entries = content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return 'No activity logged yet.';
  }

  return entries.slice(-n).reverse().map((entry) => {
    const { ts, skill, trigger } = entry;
    const timestamp = ts.substring(0, 16).replace('T', ' ');

    return `- [${timestamp}] ${skill} - "${trigger}"`;
  }).join('\n');
}

module.exports = {
  logActivity,
  getLogSummary
};
