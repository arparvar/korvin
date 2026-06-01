# Korvin — Live State Report & Comparison
**Date:** 2026-05-31  
**Tested by:** Claude (orchestrator) — hands-on dashboard click-through + VPS terminal  
**Deployment:** Hostinger VPS, commit c8fd65e  

---

## 1. Live Dashboard Test Results

### Home Tab
| Item | Status | Value |
|---|---|---|
| Agent | ✅ running | — |
| Model | ✅ active | gemini-flash via LiteLLM |
| Telegram | ✅ active | @NosisTechBot |
| Voice | ✅ correct | Whisper tiny.en + Kokoro TTS |
| Memory | ✅ persistent | SQLite |
| LiteLLM health | ✅ FIXED | reachable (was showing error before fix) |
| Bot health | ✅ | running |
| Memory count | ✅ | 239 messages |
| Backup | ✅ | 2026-05-31_18-00-01 (~1h ago) |
| Overall | ✅ | ok |

### Chat Tab — Model Identity Test
| Question | Before fix | After fix (c8fd65e) |
|---|---|---|
| "What model are you running on right now?" | "I am a large language model, trained by Google." | **"I am Korvin, powered by Gemini Flash."** ✅ |
| "Who are you?" | Correct (Korvin identity) | Correct (Korvin identity) ✅ |
| Memory of past messages | Working | Working ✅ |
| Mic button in chat | Present | Present ✅ |

### Settings Tab
| Setting | Status |
|---|---|
| Active model switcher (DeepSeek V4 Pro / Flash / Gemini Flash) | ✅ working |
| API pricing config per 1M tokens | ✅ |
| Chat timeout (180s) | ✅ |
| Connected channels: Telegram @NosisTechBot | ✅ connected |
| WhatsApp / Discord / Signal | ⚪ pending setup |
| STT label | ✅ Whisper tiny.en — active |
| TTS label | ✅ Kokoro — active |

### Skills Tab
Installed: `web-researcher`, `task-automator`, `document-drafter`, `inbox-summarizer`, `security-monitor`  
All registered. No manifest errors.

### Memory Tab
- Context window: 46/46 messages, CRITICAL badge (100% of message limit)
- Token usage: ~4358 tokens = only 3.4% of 128k cap (not actually at risk)
- Strategy: Sliding Window — auto-prune oldest
- Search: working
- **Note:** The CRITICAL badge is cosmetic — the message count limit (46) is full but the token cap is far from reached. The slider shows 500 — there may be a disconnect between the agent's applied limit and the UI slider value.

### Security Tab
- Injection defender: ✅ active
- Recent threats: none blocked
- Kill switch: OFF (agent running normally) ✅

### Logs Tab
- Shows "No log entries found" — log viewer is empty
- **Gap:** Log viewer endpoint may be reading the wrong path or logs are not being written in the expected format. Not critical but needs investigation.

---

## 2. Slash Commands — What Actually Works Where

This is a key distinction revealed by live testing:

| Command | Telegram Bot | Dashboard Chat |
|---|---|---|
| `/skills list` | ✅ Routes to dispatcher handler | ❌ Falls through to LLM (makes up answer) |
| `/scan url <url>` | ✅ Routes to web-researcher | ❌ Falls through to LLM |
| `/patch <pkg>` | ✅ Routes to apt check | ❌ Falls through to LLM |
| `research <topic>` | ✅ Runs web-researcher skill | ❌ Falls through to LLM |
| `security report` | ✅ Runs VPS health check | ❌ Falls through to LLM |

**Root cause:** `dispatcher.js` is imported by the Telegram bot only. The dashboard `/api/chat` endpoint in `main.py` sends everything straight to LiteLLM. The dashboard would need its own skill-routing layer to support these commands.

---

## 3. Design Philosophy Alignment

Korvin's stated mission: **lightweight, safe, secure, easy to install by anyone, runs local models for privacy.**

| Goal | Current State | Assessment |
|---|---|---|
| Lightweight | FastAPI + Node.js, SQLite, runs on $4/mo VPS (2.2GB RAM used of available) | ✅ Excellent |
| Safe / Secure | Injection defender, log redaction, rate limiter, confirmation gate, input sanitizer, HTTPS via Cloudflare | ✅ Solid |
| Easy install | Requires Node.js, Python 3, systemd config, env vars, LiteLLM config — no installer script | ⚠️ Needs work |
| Local model support | LiteLLM proxy is model-agnostic and Ollama-compatible. Currently using Gemini Flash + DeepSeek to test model-agnostic function (intentional) | ✅ Architecture ready |
| Model-agnostic | Dashboard model switcher works live, system prompts read active model dynamically | ✅ Working |
| Privacy | No data leaves VPS except to configured LLM API. Memory stays in SQLite on-server | ✅ Good |

**Note on local models:** The user is currently using Gemini Flash and DeepSeek via API for testing purposes only — to validate the model-agnostic architecture without the overhead of local model setup. The system is designed to drop in Ollama or any OpenAI-compatible local endpoint by changing the LiteLLM config. This is the right call.

---

## 4. OpenClaw — Korvin Phase B (src/openclaw/)

OpenClaw is **not an external project** — it is the security-hardened Phase B evolution of Korvin's Telegram bot, living at `src/openclaw/`. It uses the same LiteLLM gateway, SQLite memory, and skills, but adds a full middleware stack:

| Layer | Main Bot | OpenClaw (Phase B) |
|---|---|---|
| Input sanitization | Basic | ✅ `sanitizeInput` middleware |
| Injection defense | ✅ (shared `defender.js`) | ✅ `defend()` per message |
| Rate limiting | None | ✅ `checkRateLimit()` |
| Confirmation gate | None | ✅ `confirmationGate` for destructive actions |
| Log redaction | ✅ (shared) | ✅ `installLogRedaction()` |
| Activity logging | None | ✅ `logActivity` |
| /patch command | ✅ dispatcher | ✅ `registerPatch` module |
| Preferences | None | ✅ persistent per-user prefs |
| Session management | None | ✅ `resetSession`, `summarizeSession` |

**OpenClaw is the production-hardened path.** The current deployed bot (`korvin.service`) should eventually migrate to OpenClaw as the default.

---

## 5. Hermes — Korvin's Memory Engine (src/hermes/memory.py)

Hermes is not an external project — it is Korvin's own memory layer, inspired by the NousResearch Hermes design philosophy but written from scratch. It lives at `src/hermes/memory.py`.

### Architecture
- **Storage:** SQLite at `data/memory.db` (auto-created on first use)
- **Schema:** `messages(id, chat_id, role, content, source, timestamp)` — `source` column added via ALTER TABLE guard for safe schema upgrades on existing installs
- **Isolation:** per-`chat_id` history — Telegram user, dashboard session, and any future channel each get their own thread

### Memory Strategies (config.json `memory_strategy`)
| Strategy | Default | Behavior |
|---|---|---|
| `sliding_window` | ✅ default | Deletes oldest messages when count > `memory_limit` (default 100) |
| `summarize` | Optional | Batches oldest `limit//2` messages → calls LiteLLM → replaces with `[SUMMARY]` system message; falls back to sliding_window on LLM failure |
| `hard_stop` | Optional | Hard cap: if count > limit after insert, deletes the most recently inserted message (prevents new writes beyond limit) |

### Summarizer (`_call_summarizer`)
- Hits LiteLLM at `config.summarizer_url` (default `http://localhost:4000/v1/chat/completions`)
- Uses `config.summarizer_model` (default `deepseek-v4-flash`)
- System prompt: preserves key facts, decisions, and context; output is `[SUMMARY]` tagged
- Max tokens: 512; 1 automatic retry with 2s delay on failure

### Public API
```python
save(chat_id, role, content, source=None)  # saves + enforces strategy
get_history(chat_id, limit=10)             # returns [{role, content, source}] newest-last
prune(chat_id, limit)                      # manual sliding-window prune
clear(chat_id)                             # wipe all history for a chat_id
```

### Assessment vs "anyone can install" goal
- ✅ Zero external Python deps — uses only stdlib (`sqlite3`, `urllib.request`, `json`, `datetime`)
- ✅ Schema self-migrates — safe to upgrade without manual DB changes
- ✅ Strategy is runtime-configurable — no code change needed to switch modes
- ⚠️ `hard_stop` deletes the newest message on overflow — this is unusual behavior. Deleting the oldest would be more intuitive. Low priority, not user-visible.
- ⚠️ `get_history(limit=10)` default is low for long conversations — the dashboard sets its own limit via the API call, so this is not a blocker

---

## 6. Gaps & Next Actions

| Gap | Priority | Notes |
|---|---|---|
| Logs tab empty | Medium | Log viewer reads wrong path or format |
| Dashboard slash commands not routed | Medium | Would need skill routing in main.py /api/chat |
| Memory context CRITICAL badge | Low | Cosmetic — token usage fine, slider/agent limit mismatch |
| No one-command installer | High (for "anyone can install" goal) | Docker Compose or install.sh would unlock this |
| WhatsApp / Discord / Signal pending | Low | Future channels |
| OpenClaw not deployed as default bot | Medium | Phase B is more secure — worth migrating |
| ZIION clean install test | Pending | Not yet completed |
