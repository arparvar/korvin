// src/commands/patch.js
// /patch <package> — LLM researches CVEs, returns recommendation only (no shell execution)
'use strict';

function registerPatch(bot, deps) {
  const { confirmationGate, logActivity } = deps;

  bot.onText(/\/patch(?:\s+(.+))?/, async (msg, match) => {
    const chatId = String(msg.chat.id);
    const userId = String(msg.from.id);
    const target = match[1] ? match[1].trim() : null;

    if (!target) {
      await bot.sendMessage(
        msg.chat.id,
        '⚠️ *Usage:* `/patch <package>`\n\nExample: `/patch openssl`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      await confirmationGate({
        action: 'patch',
        args: { target },
        chatId,
        userId,
        sendMessage: (cid, text) => bot.sendMessage(cid, text, { parse_mode: 'Markdown' }),
        executor: async () => {
          const { sendMessage } = require('../openclaw/gateway');

          await bot.sendMessage(msg.chat.id, `🔍 *Researching CVEs for \`${target}\`…*`, { parse_mode: 'Markdown' });

          const prompt = [
            `Research known CVEs for the software package "${target}".`,
            `For each CVE, include: CVE ID, CVSS severity score, one-line description, and the recommended patched version or mitigation command.`,
            `Do NOT execute anything. Provide only the security intelligence.`,
            `If the package is not found, say so clearly.`,
          ].join('\n');

          const raw = await sendMessage(prompt, chatId);

          const reply = `📋 *Patch intelligence for \`${target}\`*\n\n${raw}`;
          await bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
          await bot.sendMessage(msg.chat.id, `⚠️ Disclaimer: This is AI-generated security intelligence. Verify all CVE IDs, severity scores, and patch recommendations against the official NVD (nvd.nist.gov) or the vendor's security advisory before taking action. KORVIN does not guarantee accuracy.`);

          if (logActivity) {
            try { logActivity('patch_cve_research', target, raw.substring(0, 200)); } catch (_) {}
          }
        }
      });
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Patch error: ${err.message}`);
    }
  });
}

module.exports = { registerPatch };