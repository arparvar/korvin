// src/openclaw/telegram-bot.js
// Korvin AI Security Agent — Phase B

'use strict';

require('../security/log-redact').installLogRedaction();

const TelegramBot = require('node-telegram-bot-api');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { sendMessage, getActiveModel, addPreference, getPreferences, removePreference, clearPreferences, resetSession, searchMessages, summarizeSession, saveNamedSession, loadNamedSession, appendMemory, appendUserNote, getGoal, setGoal, clearGoal } = require('./gateway');
const { researchTopic } = require('../skills/research');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const https = require('https');
const os = require('os');
const cron = require('node-cron');
const execFileAsync = promisify(execFile);

// ── Middleware ────────────────────────────────────────────────────────────────
const { validateInput } = require('../middleware/sanitizer');
const { confirmationGate, confirmAction, cancelAction, listPending } = require('../middleware/confirmation-gate');
const { checkRateLimit } = require('../security/rate-limiter');

// ── Skills ────────────────────────────────────────────────────────────────────
const { logActivity, getLogSummary } = require('../skills/activity-log');
const { loadCronJobs, removeCronJob, getSecurityReport, SECURITY_CHAT_PATH } = require('../skills/dispatcher');

// ── Commands (Phase B) ────────────────────────────────────────────────────────
const { registerPatch } = require('../commands/patch');
const { registerScan } = require('../commands/scan');

// ── Dashboard (Phase B) ───────────────────────────────────────────────────────

const ALLOWED_USER_IDS = new Set((process.env.KORVIN_ALLOWED_USERS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean));

function isAllowedUserId(userId) {
  return ALLOWED_USER_IDS.size > 0 && ALLOWED_USER_IDS.has(String(userId || ''));
}

function isAllowed(msg) {
  return isAllowedUserId(msg && msg.from && msg.from.id);
}

// ── Bot init ──────────────────────────────────────────────────────────────────
// Bot token comes ONLY from the environment (/etc/korvin.env). Secrets never live in config.json (B113).
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const telegramEnabled = BOT_TOKEN !== '';
const disabledBot = {
  onText: () => {},
  on: () => {},
  sendMessage: async () => {},
  sendVoice: async () => {},
  getFile: async () => { throw new Error('Telegram bot disabled'); }
};
const bot = telegramEnabled ? new TelegramBot(BOT_TOKEN, { polling: true }) : disabledBot;

if (telegramEnabled && ALLOWED_USER_IDS.size === 0) {
  console.warn('[Korvin] WARNING: KORVIN_ALLOWED_USERS is empty. Telegram access is locked until the owner user ID is configured.');
}

function denyTelegram(msg) {
  const chatId = msg && msg.chat && msg.chat.id;
  if (chatId) return bot.sendMessage(chatId, 'Access denied.');
}

const originalOnText = bot.onText.bind(bot);
bot.onText = (regexp, handler) => originalOnText(regexp, async (msg, match) => {
  if (!isAllowed(msg)) return denyTelegram(msg);
  return handler(msg, match);
});

const originalOn = bot.on.bind(bot);
bot.on = (event, handler) => originalOn(event, async (payload) => {
  if (event === 'callback_query') {
    if (!isAllowedUserId(payload && payload.from && payload.from.id)) {
      return bot.answerCallbackQuery(payload.id, { text: 'Access denied.' });
    }
  }
  if ((event === 'message' || event === 'voice') && !isAllowed(payload)) {
    return denyTelegram(payload);
  }
  return handler(payload);
});

const VOICE_DIR = '/tmp/korvin_voice';
const GOAL_CHAT_PATH = path.join(ROOT, 'data', 'goal_chat.txt');
const TELEGRAM_FILE_ID_RE = /^[A-Za-z0-9_-]+$/;
if (!fs.existsSync(VOICE_DIR)) fs.mkdirSync(VOICE_DIR);

// ── Grill Mode state ──────────────────────────────────────────────────────────
const pendingGrills = new Map();

// ── Brief Mode state ─────────────────────────────────────────────────────────
let briefMode = false;
const scheduledCronTasks = new Map();

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

async function transcribe(audioPath) {
  const script = `
import warnings
import sys
warnings.filterwarnings('ignore')
from faster_whisper import WhisperModel
m = WhisperModel('tiny.en', device='cpu', compute_type='int8')
segments, _ = m.transcribe(sys.argv[1], language='en', beam_size=1, vad_filter=False)
print(' '.join(s.text for s in segments).strip())
`;
  const { stdout } = await execFileAsync(
    path.join(ROOT, 'venv', 'bin', 'python3'),
    ['-c', script, audioPath],
    { cwd: ROOT, encoding: 'utf8', stderr: 'pipe' }
  );
  return stdout.trim();
}

async function generateSpeech(text, outputPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'korvin-tts-'));
  const textFile = path.join(tempDir, 'input.txt');
  const ttsText = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1');
  const script = `
import warnings, sys
warnings.filterwarnings('ignore')
sys.path.insert(0, 'src/voice')
from voice import generate_speech
text = open(sys.argv[1]).read()
generate_speech(text, sys.argv[2])
`;
  try {
    fs.writeFileSync(textFile, ttsText, 'utf8');
    await execFileAsync(path.join(ROOT, 'venv', 'bin', 'python3'), ['-c', script, textFile, outputPath], { cwd: ROOT });
    return outputPath;
  } finally {
    cleanup(textFile);
    try { fs.rmdirSync(tempDir); } catch (_) {}
  }
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

function sendKeyboard(chatId, text, keyboard) {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

function formatError(action, error) {
  console.error(`Telegram ${action} error:`, error);
  return `Couldn't ${action}. Check the server logs for details.`;
}

function isNoise(text) {
  const s = String(text || '').trim();
  return s.length < 15 || /^(sorry|i (can't|don't|cannot)|nothing to report|no results)/i.test(s);
}

function activateCronJob(job) {
  if (!job || !job.id || !job.cronExpr || !job.action || scheduledCronTasks.has(job.id)) return;
  if (!cron.validate(job.cronExpr)) return;
  const task = cron.schedule(job.cronExpr, async () => {
    try {
      const result = await sendMessage(job.action, 'cron-' + job.id);
      if (job.chatId && job.chatId !== 'default' && !isNoise(result)) {
        await bot.sendMessage(job.chatId, result);
      }
    } catch (err) {
      console.error('Cron job error:', err.message);
    }
  });
  scheduledCronTasks.set(job.id, task);
}

function activateStoredCronJobs() {
  for (const job of loadCronJobs()) activateCronJob(job);
}

function cancelScheduledJob(id) {
  const task = scheduledCronTasks.get(id);
  if (task) {
    task.stop();
    scheduledCronTasks.delete(id);
  }
  return removeCronJob(id);
}

function activateSecurityMonitor() {
  cron.schedule('0 8 * * 1', async () => {
    try {
      if (!fs.existsSync(SECURITY_CHAT_PATH)) return;
      const chatId = fs.readFileSync(SECURITY_CHAT_PATH, 'utf8').trim();
      if (!chatId) return;
      const report = await getSecurityReport(`cron-security-${chatId}`);
      await bot.sendMessage(chatId, report);
    } catch (err) {
      console.error('Security monitor error:', err.message);
    }
  });
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

async function getSystemStatus() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const load = os.loadavg();
  let disk = 'N/A';
  try {
    const { stdout } = await execFileAsync('df', ['-h', '/'], { encoding: 'utf8', timeout: 3000 });
    const parts = stdout.trim().split('\n').pop().split(/\s+/);
    disk = parts.length >= 5 ? `${parts[2]}/${parts[1]} (${parts[4]})` : 'N/A';
  } catch (_) {}
  const activeModelName = getActiveModel();
  return `?? *Korvin Online*\n` +
    `Model: ${activeModelName}\n` +
    `RAM: ${(used/1024/1024).toFixed(0)} MB / ${(total/1024/1024).toFixed(0)} MB (${((used/total)*100).toFixed(1)}%)\n` +
    `Disk: ${disk}\n` +
    `CPU Load: ${load[0].toFixed(2)} / ${load[1].toFixed(2)} / ${load[2].toFixed(2)}\n` +
    `Uptime: ${(os.uptime()/3600).toFixed(1)}h`;
}

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
  const report = await getSystemStatus();
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
  const id = match[1].trim();
  if (cancelScheduledJob(id)) {
    bot.sendMessage(msg.chat.id, `Scheduled job cancelled: ${id}`);
    return;
  }
  const result = cancelAction(id, String(msg.from.id));
  bot.sendMessage(msg.chat.id, result.message);
});

bot.onText(/\/pending/, (msg) => {
  const pending = listPending(String(msg.chat.id));
  if (pending.length === 0) return bot.sendMessage(msg.chat.id, 'No pending confirmations.');
  const lines = pending.map(p => p.pendingId + ' — ' + p.action).join('\n');
  bot.sendMessage(msg.chat.id, 'Pending:\n' + lines);
});

// ── Phase B Commands ──────────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const data = query.data || '';
  const userId = String(query.from.id);
  const chatId = query.message && query.message.chat.id;
  let result;
  if (data.startsWith('confirm:')) {
    result = confirmAction(data.slice(8), userId);
  } else if (data.startsWith('cancel:')) {
    result = cancelAction(data.slice(7), userId);
  } else return bot.answerCallbackQuery(query.id);
  await bot.answerCallbackQuery(query.id, { text: result.message });
  if (chatId) await bot.sendMessage(chatId, result.message);
});

const commandDeps = { confirmationGate, logActivity, sendKeyboard };
registerPatch(bot, commandDeps);
registerScan(bot, commandDeps);

// ── Rule Management ────────────────────────────────────────────────────────

bot.onText(/^\/soul$/, async (msg) => {
  try {
    const content = fs.readFileSync(path.join(ROOT, 'data', 'SOUL.md'), 'utf8').trim();
    await bot.sendMessage(msg.chat.id, '*Korvin Identity (SOUL.md)*\n\n' + content, { parse_mode: 'Markdown' });
  } catch (_) {
    await bot.sendMessage(msg.chat.id, 'No SOUL.md found at data/SOUL.md - create it to give Korvin a persistent identity.');
  }
});

bot.onText(/^\/remember (.+)/, async (msg, match) => {
  const fact = match[1].trim();
  appendMemory(fact);
  await bot.sendMessage(msg.chat.id, 'Remembered: ' + fact);
});

bot.onText(/^\/me (.+)/, async (msg, match) => {
  const note = match[1].trim();
  appendUserNote(note);
  await bot.sendMessage(msg.chat.id, 'Noted about you: ' + note);
});

bot.onText(/^\/memory$/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const mem = fs.readFileSync(path.join(ROOT, 'data', 'MEMORY.md'), 'utf8').trim();
    const usr = fs.readFileSync(path.join(ROOT, 'data', 'USER.md'), 'utf8').trim();
    await bot.sendMessage(chatId, '*MEMORY.md*\n' + mem + '\n\n*USER.md*\n' + usr, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('Memory file read error:', e);
    await bot.sendMessage(chatId, 'Could not read memory files. Check the server logs for details.');
  }
});

bot.onText(/^\/insights$/, async (msg) => {
  try {
    const USAGE_PATH = path.join(ROOT, 'data', 'token_usage.json');
    const AUDIT_PATH = path.join(ROOT, 'data', 'audit.ndjson');
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalTokens = 0;
    let bestDay = '', bestDayTokens = 0;
    try {
      const usage = JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'));
      for (const [date, day] of Object.entries(usage)) {
        if (date >= cutoff) {
          const t = day.total_tokens || 0;
          totalTokens += t;
          if (t > bestDayTokens) { bestDayTokens = t; bestDay = date; }
        }
      }
    } catch (_) {}

    let llmCount = 0, skillCount = 0;
    try {
      const lines = fs.readFileSync(AUDIT_PATH, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.ts && obj.ts.split('T')[0] >= cutoff) {
            if (obj.event === 'llm_response') llmCount++;
            if (obj.event === 'skill_dispatched') skillCount++;
          }
        } catch (_) {}
      }
    } catch (_) {}

    const cost = (totalTokens / 1_000_000 * 0.87).toFixed(3);
    const lines = [
      'Korvin - Last 30 days',
      'Tokens used: ' + totalTokens.toLocaleString(),
      'Estimated cost: $' + cost,
      'LLM responses: ' + llmCount,
      'Skills dispatched: ' + skillCount,
    ];
    if (bestDay) lines.push('Most active: ' + bestDay);
    await bot.sendMessage(msg.chat.id, lines.join('\n'));
  } catch (e) {
    console.error('Insights error:', e);
    await bot.sendMessage(msg.chat.id, 'Could not load insights. Check the server logs for details.');
  }
});

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

bot.onText(/^\/goal(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const arg = (match[1] || '').trim();
  if (!arg || arg === 'status') {
    const current = getGoal();
    await bot.sendMessage(chatId, current ? 'Active goal: ' + current : 'No active goal. Use /goal <text> to set one.');
    return;
  }
  if (arg === 'clear') {
    clearGoal();
    await bot.sendMessage(chatId, 'Goal cleared.');
    return;
  }
  setGoal(arg);
  try { fs.writeFileSync(GOAL_CHAT_PATH, String(chatId), 'utf8'); } catch (_) {}
  await bot.sendMessage(chatId, 'Goal set: ' + arg);
});

bot.onText(/^\/(new|reset)$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id ? msg.from.id : chatId;
  const count = await resetSession(userId);
  await bot.sendMessage(chatId, `Session cleared. ${count} messages removed. Starting fresh.`);
});

bot.onText(/^\/summarize$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id ? msg.from.id : chatId;
  const activeModel = getActiveModel();
  const summary = await summarizeSession(userId, activeModel);
  await bot.sendMessage(chatId, `*Session summary:*\n${summary}`, { parse_mode: 'Markdown' });
});

bot.onText(/^\/search (.+)/, async (msg, match) => {
  const query = match[1].trim();
  try {
    const results = await searchMessages(String(msg.chat.id), query, 5);
    if (results.length === 0) {
      await bot.sendMessage(msg.chat.id, `No messages found matching "${query}".`);
      return;
    }
    const lines = results.map((result, i) => {
      const preview = result.content.length > 120 ? result.content.substring(0, 120) + '…' : result.content;
      return `${i + 1}. ${result.role}: ${preview}`;
    });
    await bot.sendMessage(msg.chat.id, lines.join('\n'));
  } catch (err) {
    console.error('Search error:', err);
    await bot.sendMessage(msg.chat.id, 'Search failed. Check the server logs for details.');
  }
});

bot.onText(/^\/save\s+(\S+)/, async (msg, match) => {
  if (!isAllowed(msg)) return bot.sendMessage(msg.chat.id, 'Access denied.');
  const name = match[1].trim();
  try {
    const result = await saveNamedSession(String(msg.chat.id), name);
    bot.sendMessage(msg.chat.id, result);
  } catch (e) {
    console.error('Save session error:', e);
    bot.sendMessage(msg.chat.id, 'Failed to save session. Check the server logs for details.');
  }
});

bot.onText(/^\/load\s+(\S+)/, async (msg, match) => {
  if (!isAllowed(msg)) return bot.sendMessage(msg.chat.id, 'Access denied.');
  const name = match[1].trim();
  try {
    const result = await loadNamedSession(String(msg.chat.id), name);
    bot.sendMessage(msg.chat.id, result);
  } catch (e) {
    console.error('Load session error:', e);
    bot.sendMessage(msg.chat.id, 'Failed to load session. Check the server logs for details.');
  }
});

// ── Text Handler ──────────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || msg.voice) return;

  const rateLimit = checkRateLimit(msg.from && msg.from.id ? msg.from.id : chatId);
  if (!rateLimit.allowed) {
    await bot.sendMessage(chatId, `Too many requests. Please wait ${rateLimit.retryAfterSeconds} seconds.`);
    return;
  }

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

  const sanity = validateInput(text);
  if (sanity.safe === false) {
    console.warn('Telegram input rejected:', sanity.reason);
    await bot.sendMessage(chatId, 'Input rejected.');
    return;
  }

  // ── Implicit correction detection ──
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
  const fileId = msg.voice && msg.voice.file_id;
  if (!TELEGRAM_FILE_ID_RE.test(String(fileId || ''))) {
    await bot.sendMessage(chatId, 'Voice file rejected.');
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(VOICE_DIR, 'msg-'));
  const oggPath = path.join(tempDir, 'input.ogg');
  const wavPath = path.join(tempDir, 'input.wav');
  const replyWav = path.join(tempDir, 'reply.wav');

  console.log('Voice received:', msg.voice.file_id);
  try {
    const fileInfo = await bot.getFile(msg.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;

    await downloadFile(fileUrl, oggPath);
    await execFileAsync('ffmpeg', ['-y', '-i', oggPath, wavPath], { stdio: ['ignore', 'ignore', 'ignore'] });

    const transcript = await transcribe(wavPath);
    console.log('Transcript:', transcript);
    const voiceCheck = validateInput(transcript);
    if (!voiceCheck.safe) {
      console.warn('Telegram voice input rejected:', voiceCheck.reason);
      await bot.sendMessage(chatId, 'Voice input rejected.');
      cleanup(oggPath, wavPath, replyWav);
      try { fs.rmdirSync(tempDir); } catch (_) {}
      return;
    }

    // ── Implicit correction detection for voice ──
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
    try { fs.rmdirSync(tempDir); } catch (_) {}
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

function activateDailyDigest() {
  cron.schedule('0 23 * * *', async () => {
    try {
      if (!fs.existsSync(SECURITY_CHAT_PATH)) return;
      const chatId = fs.readFileSync(SECURITY_CHAT_PATH, 'utf8').trim();
      if (!chatId) return;
      const digest = await summarizeSession(chatId, getActiveModel());
      if (!digest) return;
      appendMemory('Daily digest: ' + digest.slice(0, 200));
      await bot.sendMessage(chatId, 'Daily digest:\n' + digest);
    } catch (err) {
      console.error('Daily digest error:', err.message);
    }
  });
}

function activateGoalHeartbeat() {
  setInterval(async () => {
    try {
      const goal = getGoal();
      if (!goal) return;
      if (!fs.existsSync(GOAL_CHAT_PATH)) return;
      const chatId = fs.readFileSync(GOAL_CHAT_PATH, 'utf8').trim();
      if (!chatId) return;
      await bot.sendMessage(chatId, 'Goal check-in: ' + goal);
    } catch (_) {}
  }, 4 * 60 * 60 * 1000);
}

(async () => {
  if (!telegramEnabled) {
    console.log('[Korvin] TELEGRAM_BOT_TOKEN not set - running in dashboard-only mode. Telegram bot disabled.');
    console.log('[Korvin] Dashboard runs as a separate Python service (korvin-dashboard.service).');
  } else {
    activateStoredCronJobs();
    activateSecurityMonitor();
    activateDailyDigest();
    activateGoalHeartbeat();
    console.log('Korvin bot started. /help for commands.');

    setTimeout(async () => {
      try {
        await execFileAsync(
          path.join(ROOT, 'venv', 'bin', 'python3'),
          ['-c', `
import warnings
warnings.filterwarnings('ignore')
from faster_whisper import WhisperModel
WhisperModel('tiny.en', device='cpu', compute_type='int8')
print('ok')
`],
          { cwd: ROOT, encoding: 'utf8', timeout: 60000 }
        );
        console.log('Whisper model pre-warmed.');
      } catch (_) {
        console.log('Whisper pre-warm skipped (will load on first voice message).');
      }
    }, 3000);
  }
})();
