const fs = require('fs');

const LOG_FILE = '/home/korvin/korvin/docs/activity.md';

if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '# Korvin Activity Log\n\nAuto-generated.\n\n---\n\n', 'utf8');
}

function logActivity(skill, trigger, summary) {
  const timestamp = new Date().toISOString();
  const entry = `### ${timestamp}\n- **Skill:** ${skill}\n- **Trigger:** ${trigger}\n- **Result:** ${summary.substring(0, 150)}...\n\n`;
  fs.appendFileSync(LOG_FILE, entry, 'utf8');
}

function getLogSummary(n = 10) {
  if (!fs.existsSync(LOG_FILE)) return 'No activity logged yet.';
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const entries = content.split('### ').filter(e => e.includes('Skill:'));
  if (entries.length === 0) return 'No activity logged yet.';
  return entries.slice(-n).reverse().map(e => {
    const lines = e.trim().split('\n');
    const ts = lines[0].trim().substring(0, 16).replace('T', ' ');
    const skill = (lines.find(l => l.includes('Skill:')) || '').replace('- **Skill:**', '').trim();
    const trigger = (lines.find(l => l.includes('Trigger:')) || '').replace('- **Trigger:**', '').trim();
    return `• [${ts}] ${skill} — "${trigger}"`;
  }).join('\n');
}

module.exports = { logActivity, getLogSummary };
