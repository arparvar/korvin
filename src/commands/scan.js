// src/commands/scan.js
// /scan <target> — VirusTotal lookup or system audit (reads weekly lynis report)
'use strict';

const fs = require('fs');

function detectTargetType(target) {
  if (/^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(target)) return 'file';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(target)) return 'ip';
  if (/^[0-9a-fA-F:]{17,39}$/.test(target)) return 'ip'; // IPv6 basic
  return 'url'; // domains and URLs
}

function buildVTUrl(target, type) {
  if (type === 'file') return `https://www.virustotal.com/api/v3/files/${target}`;
  if (type === 'ip')   return `https://www.virustotal.com/api/v3/ip_addresses/${target}`;
  // URLs and domains: VT requires base64url-encoded URL (no padding)
  const encoded = Buffer.from(target).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `https://www.virustotal.com/api/v3/urls/${encoded}`;
}

function formatStats(attrs, target, type) {
  const stats = attrs?.last_analysis_stats || {};
  const total = Object.values(stats).reduce((a, b) => a + b, 0) || 1;
  const malicious  = stats.malicious  || 0;
  const suspicious = stats.suspicious || 0;
  const harmless   = stats.harmless   || 0;
  const undetected = stats.undetected || 0;

  const emoji = malicious > 0 ? '🔴' : suspicious > 0 ? '🟡' : '🟢';
  const lines = [`${emoji} *VirusTotal — \`${target}\`*`, `_Type: ${type.toUpperCase()}_`, ''];

  lines.push(`• Malicious:  ${malicious}/${total} engines`);
  lines.push(`• Suspicious: ${suspicious}/${total} engines`);
  lines.push(`• Harmless:   ${harmless} | Undetected: ${undetected}`);

  if (attrs?.meaningful_name) lines.push(`• Name: ${attrs.meaningful_name}`);
  if (attrs?.country)         lines.push(`• Country: ${attrs.country}`);
  if (attrs?.as_owner)        lines.push(`• ASN Owner: ${attrs.as_owner}`);
  if (attrs?.last_submission_date) {
    const d = new Date(attrs.last_submission_date * 1000).toISOString().split('T')[0];
    lines.push(`• Last submission: ${d}`);
  }

  if (malicious === 0 && suspicious === 0) {
    lines.push('', '✅ No threats detected.');
  } else {
    lines.push('', `⚠️ *${malicious} engine(s) flagged this as malicious.*`);
  }

  lines.push('', '⚠️ *Disclaimer:* A clean result means no engine flagged this target at scan time. It does not guarantee safety — new threats may not yet be in VirusTotal\'s database. KORVIN is not responsible for decisions made based on this result.');

  return lines.join('\n');
}

function registerScan(bot, deps) {
  const { confirmationGate, logActivity } = deps;

  bot.onText(/\/scan(?:\s+(.+))?/, async (msg, match) => {
    const chatId = String(msg.chat.id);
    const userId = String(msg.from.id);
    const target = match[1] ? match[1].trim() : 'system';

    try {
      await confirmationGate({
        action: 'scan',
        args: { target },
        chatId,
        userId,
        sendMessage: (cid, text) => bot.sendMessage(cid, text, { parse_mode: 'Markdown' }),
        executor: async () => {

          // ── System scan — reads weekly root-generated lynis report ──
          if (target === 'system' || target === 'full-system') {
            const reportPath = '/home/korvin/korvin/data/lynis-report.txt';
            if (!fs.existsSync(reportPath)) {
              await bot.sendMessage(chatId, '📋 No lynis report found. The weekly audit runs every Sunday at 2 AM.');
              return;
            }
            const output = fs.readFileSync(reportPath, 'utf8');
            const lines  = output.split('\n');
            const lastRun = lines[0] || 'Unknown date';
            const body    = lines.slice(1).join('\n');
            await bot.sendMessage(chatId,
              `📋 *Lynis System Audit* (last run: ${lastRun})\n\n\`\`\`${body.substring(0, 3500)}\`\`\``,
              { parse_mode: 'Markdown' }
            );
            if (logActivity) try { logActivity('system_scan', 'lynis report read', lastRun); } catch (_) {}
            return;
          }

          // ── VirusTotal lookup ──
          const API_KEY = process.env.VIRUSTOTAL_API_KEY;
          if (!API_KEY) {
            await bot.sendMessage(chatId, '❌ VirusTotal API key not configured. Add VIRUSTOTAL_API_KEY to /etc/korvin.env');
            return;
          }

          const type = detectTargetType(target);
          await bot.sendMessage(chatId,
            `🔍 *Scanning \`${target}\`…* _(${type})_`,
            { parse_mode: 'Markdown' }
          );

          const vtUrl = buildVTUrl(target, type);
          const res = await fetch(vtUrl, {
            headers: { 'x-apikey': API_KEY, 'Accept': 'application/json' }
          });

          // URL endpoint returns 404 if never submitted — submit first, then poll
          if (res.status === 404 && type === 'url') {
            await bot.sendMessage(chatId, `⚪ "${target}" has never been submitted to VirusTotal. No data available.`);
            return;
          }

          if (!res.ok) {
            const body = await res.text().catch(() => '');
            await bot.sendMessage(chatId, `❌ VirusTotal API error: ${res.status}\n${body.substring(0, 200)}`);
            return;
          }

          const json  = await res.json();
          const attrs = json?.data?.attributes;

          if (!attrs) {
            await bot.sendMessage(chatId, `⚪ No analysis data found for "${target}".`);
            return;
          }

          const report = formatStats(attrs, target, type);
          await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });

          if (logActivity) try { logActivity('scan_completed', target, type); } catch (_) {}
        }
      });
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Scan error: ${err.message}`);
    }
  });
}

module.exports = { registerScan };