// src/openclaw/telegram-bot.js
// Korvin AI Security Agent — Phase B

'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { exec, execSync } = require('child_process');
const { sendMessage, getActiveModel, addPreference, getPreferences, removePreference, clearPreferences } = require('./gateway');
const { researchTopic } = require('../skills/research');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// ── Middleware ────────────────────────────────────────────────────────────────
const { sanitizeInput } = require('../middleware/sanitizer');
const { confirmationGate, confirmAction, cancelAction, listPending } = require('../middleware/confirmation-gate');
const { defend } = require('../security/defender');

// ── Skills ────────────────────────────────────────────────────────────────────
const { logActivity, getLogSummary } = require('../skills/activity-log');

// ── Commands (Phase B) ────────────────────────────────────────────────────────
const { registerPatch } = require('../commands/patch');
const { registerScan } = require('../commands/scan');

// ── Dashboard (Phase B) ───────────────────────────────────────────────────────
const { startDashboard } = require('../dashboard-api/server');

// ── Bot init ──────────────────────────────────────────────────────────────────
const BOT_TOKEN = require('../../config.json').telegramToken;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const VOICE_DIR = '/tmp/korvin_voice';
if (!fs.existsSync(VOICE_DIR)) fs.mkdirSync(VOICE_DIR);

// ── Grill Mode state ──────────────────────────────────────────────────────────
const pendingGrills = new Map();

// ── Brief Mode state ─────────────────────────────────────────────────────────
let briefMode = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', reject);
  });
}

function transcribe(audioPath) {
  return execSync(
    `cd /home/korvin/korvin && venv/bin/python3 -c "
import warnings, whisper
warnings.filterwarnings('ignore')
m = whisper.load_model('tiny.en')
r = m.transcribe('${audioPath}', fp16=False)
print(r['text'].strip())
"`,
    { encoding: 'utf8', stderr: 'pipe' }
  ).trim();
}

function generateSpeech(text, outputPath) {
  return new Promise((resolve, reject) => {
    const textFile = '/tmp/korvin_tts_input.txt';
    const ttsText = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1');
    fs.writeFileSync(textFile, ttsText, 'utf8');
    exec(
      `cd /home/korvin/korvin && venv/bin/python3 -c "
import warnings, sys
warnings.filterwarnings('ignore')
sys.path.insert(0, 'src/voice')
from voice import generate_speech
text = open('/tmp/korvin_tts_input.txt').read()
generate_speech(text, '${outputPath}')
"`,
      (err) => err ? reject(err) : resolve(outputPath)
    );
  });
}

function cleanReply(text) {
  return text
    .split('\n')
    .filter(l => !l.includes('repo_id') && !l.includes('WARNING') && !l.includes('UserWarning'))
    .join('\n')
    .trim();
}

function cleanup(...files) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }
}

function formatError(action, error) {
  const reason = error.message || 'an unexpected error occurred';
  return `Couldn't ${action} because ${reason}.`;
}

// ── Grill Mode ────────────────────────────────────────────────────────────────

async function generateGrillQuestions(topic) {
  const prompt = `You are Korvin. The user wants to research: "${topic}". Before doing any research, generate 3-5 clarifying questions that will help narrow the scope and produce a better result. Number the questions. Be concise.`;
  return await sendMessage(prompt);
}

// ── Research ──────────────────────────────────────────────────────────────────

async function getResearchSummary(topic) {
  const rawData = await researchTopic(topic);
  const prompt = `You are Korvin. Summarise the following search results for "${topic}". Give a concise report with key points. Only use information from the search results.\n\nSEARCH RESULTS:\n${rawData}`;
  const summary = await sendMessage(prompt);
  try { logActivity('research', topic, summary); } catch (_) {}
  return summary;
}

// ── System Status ─────────────────────────────────────────────────────────────

function getSystemStatus() {
  try {
    const sys = JSON.parse(execSync('curl -s --max-time 2 http://localhost:3000/api/system').toString());
    const activeModelName = getActiveModel();
    return `🟢 *Korvin Online*\n` +
      `🧠 Model: ${activeModelName}\n` +
      `💾 Disk: ${sys.disk_used} / ${sys.disk_total} (${sys.disk_pct})\n` +
      `🧮 RAM: ${sys.mem_used_mb} MB / ${sys.mem_total_mb} MB (${sys.mem_pct}%)\n` +
      `📊 CPU Load: ${sys.load_1m} / ${sys.load_5m} / ${sys.load_15m}\n` +
      `⏱ Uptime: ${sys.uptime_hours}h`;
  } catch (_) {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const load = os.loadavg();
    let disk = 'N/A';
    try {
      disk = execSync("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\")\"}'" ).toString().trim();
    } catch (_) {}
    const activeModelName = getActiveModel();
    return `🟡 *Korvin Online* _(dashboard offline)_\n` +
      `🧠 Model: ${activeModelName}\n` +
      `🧮 RAM: ${(used/1024/1024).toFixed(0)} MB / ${(total/1024/1024).toFixed(0)} MB (${((used/total)*100).toFixed(1)}%)\n` +
      `💾 Disk: ${disk}\n` +
      `📊 CPU Load: ${load[0].toFixed(2)} / ${load[1].toFixed(2)} / ${load[2].toFixed(2)}\n` +
      `⏱ Uptime: ${(os.uptime()/3600).toFixed(1)}h`;
  }
}

// ── Implicit Correction Detection ─────────────────────────────────────────────

function detectCorrection(text) {
  const triggers = [
    /\b(?:don'?t|do not)\b/i,
    /\bstop\b/i,
    /\bnext time\b/i,
    /\bfrom now on\b/i,
    /\balways\b/i,
    /\bnever\b/i,
    /\binstead of\b/i,
    /\bprefer\b/i,
    /\bplease\b/i,
  ];
  for (const re of triggers) {
    if (re.test(text)) {
      const rule = text.trim();
      if (rule.length > 0) {
        return rule;
      }
    }
  }
  return null;
}

// ── Command Handlers ──────────────────────────────────────────────────────────

bot.onText(/\/start|\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🛡 *Korvin — AI Security Agent*\n\n` +
    `*Commands:*\n` +
    `\`/status\` — VPS health report\n` +
    `\`/scan [target]\` — Security scan (HIGH risk)\n` +
    `\`/patch <target>\` — Apply patch (HIGH risk)\n` +
    `\`/grill <topic>\` — Clarifying questions before research\n` +
    `\`/brief\` — Toggle concise mode (one-sentence answers)\n` +
    `\`/log\` — Recent activity\n` +
    `\`/pending\` — Pending confirmations\n` +
    `\`/help\` — this menu\n\n` +
    `*Skills:*\n` +
    `• Type or say \`Research <topic>\` — web research + voice summary\n` +
    `• Send any voice message — Korvin responds in voice\n` +
    `• Send any text — Korvin replies\n`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/status/, async (msg) => {
  const report = getSystemStatus();
  await bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
});

bot.onText(/\/log/, async (msg) => {
  const summary = getLogSummary(10);
  await bot.sendMessage(msg.chat.id, `📋 *Recent Korvin Activity*\n\n${summary}`, { parse_mode: 'Markdown' });
});

// ── Confirmation Gate Handlers ────────────────────────────────────────────────

bot.onText(/\/confirm (.+)/, (msg, match) => {
  const result = confirmAction(match[1].trim(), String(msg.from.id));
  bot.sendMessage(msg.chat.id, result.message);
});

bot.onText(/\/cancel (.+)/, (msg, match) => {
  const result = cancelAction(match[1].trim(), String(msg.from.id));
  bot.sendMessage(msg.chat.id, result.message);
});

bot.onText(/\/pending/, (msg) => {
  const pending = listPending(String(msg.chat.id));
  if (pending.length === 0) return bot.sendMessage(msg.chat.id, 'No pending confirmations.');
  const lines = pending.map(p => p.pendingId + ' — ' + p.action).join('\n');
  bot.sendMessage(msg.chat.id, 'Pending:\n' + lines);
});

// ── Phase B Commands ──────────────────────────────────────────────────────────
const commandDeps = { confirmationGate, logActivity };
registerPatch(bot, commandDeps);
registerScan(bot, commandDeps);

// ── Rule Management ────────────────────────────────────────────────────────

bot.onText(/\/rule(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const command = match[1] ? match[1].trim() : '';

  if (command === '') {
    await bot.sendMessage(chatId, 'Usage:\n/rule add <rule text>\n/rule list\n/rule remove <number>\n/rule clear');
    return;
  }

  const parts = command.split(' ');
  const sub = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');

  if (sub === 'list') {
    const prefs = getPreferences();
    if (prefs.length === 0) {
      await bot.sendMessage(chatId, 'No rules set.');
    } else {
      const list = prefs.map((r, i) => `${i+1}. ${r}`).join('\n');
      await bot.sendMessage(chatId, `Current rules:\n${list}`);
    }
  } else if (sub === 'add') {
    if (!rest) {
      await bot.sendMessage(chatId, 'Please provide the rule text. Example: /rule add always use plain paragraphs.');
      return;
    }
    addPreference(rest);
    await bot.sendMessage(chatId, `Rule added: "${rest}"`);
  } else if (sub === 'remove') {
    const num = parseInt(rest, 10);
    if (isNaN(num)) {
      await bot.sendMessage(chatId, 'Usage: /rule remove <number>');
      return;
    }
    const removed = removePreference(num);
    if (removed) {
      await bot.sendMessage(chatId, `Removed rule ${num}: "${removed}"`);
    } else {
      await bot.sendMessage(chatId, `No rule found with number ${num}. Use /rule list to see existing rules.`);
    }
  } else if (sub === 'clear') {
    clearPreferences();
    await bot.sendMessage(chatId, 'All rules cleared.');
  } else {
    await bot.sendMessage(chatId, 'Unknown subcommand. Use /rule list, /rule add, /rule remove, /rule clear.');
  }
});

// ── Text Handler ──────────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || msg.voice) return;

  if (text.toLowerCase().startsWith('/brief')) {
    briefMode = !briefMode;
    await bot.sendMessage(chatId, briefMode ? '✅ Brief mode ON — one-sentence answers.' : '✅ Brief mode OFF — normal replies.');
    return;
  }

  if (text.toLowerCase().startsWith('/grill ') || text.toLowerCase().startsWith('grill ')) {
    const topic = text.replace(/^\/?grill\s+/i, '').trim();
    try {
      const questions = await generateGrillQuestions(topic);
      pendingGrills.set(chatId, { topic, questions });
      await bot.sendMessage(chatId, `🔍 *Grill Mode — ${topic}*\n\n${questions}\n\n_Reply with your answers to proceed with the research._`, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, formatError('generate questions for that topic', err));
    }
    return;
  }

  if (pendingGrills.has(chatId)) {
    const grill = pendingGrills.get(chatId);
    pendingGrills.delete(chatId);
    await bot.sendMessage(chatId, `🔍 *Researching "${grill.topic}" with your answers…*`, { parse_mode: 'Markdown' });
    try {
      const prompt = `You are Korvin. The user wants to research "${grill.topic}". Here are the clarifying questions you asked and the user's answers:\n\n${grill.questions}\n\nUser's answers:\n${text}\n\nNow perform the research based on this context. Provide a concise report.`;
      const summary = await sendMessage(prompt, chatId);
      const maxLen = 3800;
      const finalReply = summary.length > maxLen
        ? summary.substring(0, maxLen) + '\n\n_📋 Research was truncated. Ask me to elaborate on any section._'
        : summary;
      await bot.sendMessage(chatId, finalReply, { parse_mode: 'Markdown' });
      try { logActivity('grill_research', grill.topic, summary.substring(0, 200)); } catch (_) {}
    } catch (err) {
      await bot.sendMessage(chatId, formatError('complete the research', err));
    }
    return;
  }

  if (text.startsWith('/')) return;

  const sanity = sanitizeInput(text);
  if (sanity.safe === false) {
    await bot.sendMessage(chatId, 'Input rejected: ' + sanity.reason);
    return;
  }

  // ── Implicit correction detection ──
  const correctionRule = detectCorrection(sanity.value);
  if (correctionRule) {
    addPreference(correctionRule);
    await bot.sendMessage(chatId, `Got it — ${correctionRule}`);
    return;
  }

  if (sanity.value.toLowerCase().startsWith('research ')) {
    const topic = sanity.value.substring(9).trim();
    await bot.sendMessage(chatId, `🔍 Researching "${topic}" …`);
    try {
      const summary = await getResearchSummary(topic);
      await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, formatError('complete the research', err));
    }
    return;
  }

  try {
    const currentPreferences = getPreferences();
    const msgToSend = briefMode
      ? `[BRIEF MODE: Answer in one sentence, no preamble, no filler. Just the essential information.] ${text}`
      : text;
    const reply = cleanReply(await sendMessage(msgToSend, String(chatId), currentPreferences));
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, formatError('process your message', err));
  }
});

// ── Voice Handler ─────────────────────────────────────────────────────────────

bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const oggPath = path.join(VOICE_DIR, `${msg.voice.file_id}.ogg`);
  const wavPath = path.join(VOICE_DIR, `${msg.voice.file_id}.wav`);
  const replyWav = `/tmp/voice_reply_${Date.now()}.wav`;

  console.log('Voice received:', msg.voice.file_id);
  try {
    const fileInfo = await bot.getFile(msg.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;

    await downloadFile(fileUrl, oggPath);
    execSync(`ffmpeg -y -i ${oggPath} ${wavPath} 2>/dev/null`);

    const transcript = transcribe(wavPath);
    console.log('Transcript:', transcript);
    const voiceCheck = sanitizeInput(transcript);
    if (!voiceCheck.safe) { await bot.sendMessage(chatId, `❌ Voice input blocked: ${voiceCheck.reason}`); cleanup(oggPath, wavPath, replyWav); return; }

    // ── Implicit correction detection for voice ──
    const voiceCorrection = detectCorrection(transcript);
    if (voiceCorrection) {
      addPreference(voiceCorrection);
      await bot.sendMessage(chatId, `Got it — ${voiceCorrection}`);
      cleanup(oggPath, wavPath);
      return;
    }

    if (transcript.toLowerCase().includes('research ')) {
      const idx = transcript.toLowerCase().indexOf('research ') + 9;
      const topic = transcript.substring(idx).trim();
      await bot.sendMessage(chatId, `🔍 Researching "${topic}" …`);
      try {
        const summary = await getResearchSummary(topic);
        await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
        await generateSpeech(summary, replyWav);
        await bot.sendVoice(chatId, replyWav);
      } catch (err) {
        await bot.sendMessage(chatId, formatError('complete the research', err));
      }
      cleanup(oggPath, wavPath, replyWav);
      return;
    }

    const currentPreferences = getPreferences();
    const reply = cleanReply(await sendMessage(transcript, String(chatId), currentPreferences));
    console.log('Reply:', reply);
    await generateSpeech(reply, replyWav);
    await bot.sendVoice(chatId, replyWav);

  } catch (err) {
    console.error('Voice error:', err.message);
    await bot.sendMessage(chatId, formatError('process your voice message', err));
  } finally {
    cleanup(oggPath, wavPath, replyWav);
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

(async () => {
  await startDashboard();
  console.log('Korvin bot started. /help for commands.');

  setTimeout(() => {
    try {
      execSync(
        `cd /home/korvin/korvin && venv/bin/python3 -c "
import warnings, whisper
warnings.filterwarnings('ignore')
whisper.load_model('tiny.en')
print('ok')
"`,
        { encoding: 'utf8', timeout: 60000 }
      );
      console.log('Whisper model pre‑warmed.');
    } catch (_) {
      console.log('Whisper pre‑warm skipped (will load on first voice message).');
    }
  }, 3000);
})();