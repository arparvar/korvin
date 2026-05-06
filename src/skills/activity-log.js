const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../../docs/activity.md');

function ensureLogFile() {
  const logDirectory = path.dirname(LOG_FILE);

  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '# Korvin Activity Log\n\nAuto-generated.\n\n---\n\n', 'utf8');
  }
}

function logActivity(skill, trigger, summary) {
  ensureLogFile();

  const safeSummary = String(summary || '').substring(0, 150);
  const timestamp = new Date().toISOString();
  const entry = `### ${timestamp}\n- **Skill:** ${skill}\n- **Trigger:** ${trigger}\n- **Result:** ${safeSummary}...\n\n`;

  fs.appendFileSync(LOG_FILE, entry, 'utf8');
}

function getLogSummary(n = 10) {
  ensureLogFile();

  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const entries = content.split('### ').filter((entry) => entry.includes('Skill:'));

  if (entries.length === 0) {
    return 'No activity logged yet.';
  }

  return entries.slice(-n).reverse().map((entry) => {
    const lines = entry.trim().split('\n');
    const timestamp = lines[0].trim().substring(0, 16).replace('T', ' ');
    const skill = (lines.find((line) => line.includes('Skill:')) || '').replace('- **Skill:**', '').trim();
    const trigger = (lines.find((line) => line.includes('Trigger:')) || '').replace('- **Trigger:**', '').trim();

    return `- [${timestamp}] ${skill} - "${trigger}"`;
  }).join('\n');
}

module.exports = {
  logActivity,
  getLogSummary
};