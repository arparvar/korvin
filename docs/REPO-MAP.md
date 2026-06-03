# Korvin Repo Map

**Purpose:** a navigation index so Claude or Codex can locate the right file **without reading
whole files** (a context-window mitigation). Read this first to orient; open only the files a task
actually needs.

**Last generated:** 2026-06-02 · 32 source files mapped (excl. vendored libs, backups, tests, docs).
**Regenerate** after any file add/remove or major refactor (survey `src/` + root infra; one row per
file: path · lang · one-line purpose · 3–8 key symbols/routes).

---

## Architecture in brief

Korvin is a self-hosted, voice-first AI agent framework in three layers:
**(1) Telegram / gateway** — Node.js bot polls Telegram and dispatches to a skill engine; persistent
memory in SQLite. **(2) Dashboard** — FastAPI web UI (API-key or session-token gated) on
127.0.0.1:3002 behind Cloudflare; voice in/out, model selection, activity logs. **(3) Model broker**
— LiteLLM proxy on :4000 routing chat to pluggable backends (Gemini, DeepSeek, MiMo). Security runs
throughout: input sanitization, prompt-injection detection, SSRF guards, rate limiting, and a
confirmation gate for destructive ops.

---

### Dashboard (Python/FastAPI)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/dashboard/main.py | Python | Web dashboard: login, chat API, model management, token tracking, voice STT/TTS. **(1126 lines)** | `app`, `POST /api/chat`, `POST /api/login`, `POST /api/voice-input`, `GET /api/models`, `_has_valid_session()`, `_redact_sensitive()`, `require_key()` |

### Dashboard frontend

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/dashboard/static/app.js | JS | Single-page dashboard UI: chat, voice recording, model switcher, settings. | `login()`, `toggleMic()`, `api()`, `sendMessage()`, `STT_MODEL_LABELS`, `TTS_VOICE_LABELS` |
| src/dashboard/static/sw.js | JS | Service worker for offline caching and push notifications. | Cache registration, push handlers |

### Telegram bot / gateway (Node)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/openclaw/telegram-bot.js | JS | Telegram bot entry point: message routing, command handlers, polling. **(732 lines)** | `bot.onText()`, `/start`, `/help`, `/chat`, `/voice`, `/cancel`, `/confirm`, command dispatch |
| src/openclaw/gateway.js | JS | LiteLLM chat proxy, context (SOUL/MEMORY/USER files), preferences, audit logging. **(529 lines)** | `sendMessage()`, `getActiveModel()`, `addPreference()`, `appendMemory()`, `getGoal()`, `setGoal()` |

### Skills (Node)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/skills/dispatcher.js | JS | Skill command dispatcher: research, scheduling, document drafting, security reports. | `dispatchSkill()`, `runWebResearch()`, `draftDocument()`, `getSecurityReport()`, `saveScheduledTask()`, `loadCronJobs()` |
| src/skills/manifest-loader.js | JS | Plugin loader for operator skills (custom skills under `skills/` with skill.json manifest). | `loadManifestSkills()`, `dispatchManifestSkill()`, `compileSafeTrigger()` |
| src/skills/permissions.js | JS | Permission levels: read-only, network-read, local-status (operator skills cannot write). | `PERMISSION_LEVELS`, `isPermissionAllowed()`, `describePermission()` |
| src/skills/activity-log.js | JS | NDJSON activity log; tracks skill invocations and ntfy push notifications. | `logActivity()`, `getLogSummary()` |
| src/skills/research.js | JS | Web research via SearXNG with SSRF guard; result compression and deduplication. | `researchTopic()`, `makeSearxngRequest()` |
| src/skills/youtube.js | JS | YouTube transcription using yt-dlp + Whisper subprocess; requires external tools. | `transcribeYoutube()`, `validateYoutubeUrl()` |
| src/skills/dep-scan.js | JS | Read-only dependency scanner: lists package.json and requirements.txt (no execution). | `depScan()`, `verifyZeroExecution()` |

### Commands (Node)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/commands/patch.js | JS | `/patch <package>` — LLM-researches CVEs, returns intelligence only (no patching). | `registerPatch()`, confirmation gate integration |
| src/commands/scan.js | JS | `/scan <target>` — VirusTotal lookup for files, IPs, URLs; formatted threat report. | `registerScan()`, `buildVTUrl()`, `formatStats()` |

### Memory (Python)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/hermes/memory.py | Python | Persistent message store (SQLite or ChromaDB backend); sliding-window, summarize, or hard-stop strategies. | `save()`, `get_history()`, `search_similar()`, `_enforce_sliding_window()`, `_enforce_summarize()` |

### Security (Node)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/security/rate-limiter.js | JS | In-memory or SQLite-backed rate limiting (per user, configurable window/max). | `checkRateLimit()`, `checkRateLimitDb()` |
| src/security/defender.js | JS | Prompt-injection detector: blocks/labels suspicious content from YAML rules. | `defend()`, `labelSuspiciousContent()`, `loadRules()` |
| src/security/redaction.js | JS | Redacts API keys, tokens, JWTs, emails from logs (consistent patterns across codebase). | `redactText()`, `redactForLog()`, `SENSITIVE_PATTERNS` |
| src/security/log-redact.js | JS | Patches console.log/warn/error to auto-redact before output. | `installLogRedaction()` |
| src/security/ssrf-guard.js | JS | SSRF protection: DNS lookup, private-IP rejection, IPv4/IPv6 filtering, pinned DNS lookup. | `assertSafeUrl()`, `isPrivateAddress()`, `pinnedLookup()` |
| src/security/external-content.js | JS | Wraps untrusted web-search content in `[EXTERNAL CONTENT BEGIN/END]` markers for LLM awareness. | `wrapExternalContent()`, `stripSpecialTokens()` |

### Middleware (Node)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/middleware/sanitizer.js | JS | Input validation: length checks, prompt/command-injection detection, oversized payloads. | `validateInput()`, `sanitizeObject()`, `MAX_INPUT_LENGTH` |
| src/middleware/confirmation-gate.js | JS | Approval workflow for HIGH-risk actions (patch, scan, delete, exec, write). | `confirmationGate()`, `confirmAction()`, `cancelAction()`, `classifyRisk()` |
| src/middleware/skill-contract.js | JS | Skill result container with status, summary, warnings; wraps skill execution. | `SkillResult`, `executeSkill()`, status constants |

### Voice (Python)

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| src/voice/voice.py | Python | TTS via Kokoro (82M model); generates speech from text. | `generate_speech()` |

### Install / infra

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| install.sh | Shell | Systemd automated setup for VPS: app user, git clone, deps, services. | Steps 1–6: OS check, clone, Python/Node install, litellm config, systemd unit |
| install-desktop.sh | Shell | Desktop/dev setup: local dev server, no systemd. | Node + Python local dev harness |
| docker-compose.yml | YAML | 3-service orchestration: litellm, dashboard, bot (optional). | Services: litellm, dashboard, bot |
| litellm_config.docker.yaml | YAML | LiteLLM model_list: Gemini Flash, DeepSeek V4 (flash/pro), MiMo V2.5 (flash/pro); RPM limits. | Model endpoints, API key env vars |
| requirements.txt | Python | Full install (what install.sh uses): composes base + voice via `-r`. | `-r requirements-base.txt`, `-r requirements-voice.txt` |
| requirements-base.txt | Python | Dashboard-only deps (no voice). | fastapi, httpx, pydantic, uvicorn, requests, python-multipart |
| requirements-voice.txt | Python | Voice deps, CPU build (Kokoro TTS + faster-whisper STT); pins CPU torch. | kokoro, faster-whisper, ctranslate2, torch==2.12.0+cpu |
| requirements-voice-gpu.txt | Python | OPT-IN GPU override: swaps CPU torch for the CUDA build. CPU is default. | torch==2.12.0+cu130 (from PyTorch cu130 index) |
| docs/voice-cpu-vs-gpu.md | Markdown | Explains CPU vs GPU torch, the safe GPU opt-in, and the optional premium-TTS add-on path. | — |
| docs/voice-latency-and-vm-tuning.md | Markdown | Why voice cold-start lag is warmup not weakness; why adding vCPUs/RAM doesn't help; the KVM paravirt decision; the startup warm-up fix (B126). | — |
| docs/voice-architecture.md | Markdown | "One kitchen, two windows": warm in-process model serving both streaming (dashboard/LIVE) and whole-file (portable, messaging) delivery; principles a–h; the speak-the-headline 3-way toggle with the server-side `mode` rule; multi-channel reality; build sequencing. | — |
| docs/tool-call-repair-pattern.md | Markdown | Evaluation + spec of the tool-input repair layer (Command Code / Mastra): validate-then-repair, the four shape repairs, markdown-autolink leak, relational-invariant defaults. Verdict: adopt pattern not product; parked behind model-delegation; Rule 2 host-vs-hosted gate. | — |
| package.json | JS | Node root: express, telegram-bot-api, js-yaml, node-cron, cheerio. | scripts: start, test, test:cli |
| scripts/install-lib.sh | Shell | Shared bash utility library: logging, error handling. | `die()`, `info()`, `step()` |

### Example skill plugin

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| skills/example/handler.js | JS | Template for operator skills; implements `run(message, match)` export. | `run()` async function |

### Other

| Path | Lang | Purpose | Key symbols / routes |
|------|------|---------|---------------------|
| index.js | JS | Root export: `logActivity`, `getLogSummary`, version. | Package entry point |
| site/theme.js | JS | Dashboard CSS theme switcher (light/dark). | Theme selection |

---

## Large files (context-window risk — edit by region, not whole-file)

- `src/dashboard/main.py` — **1126 lines**
- `src/openclaw/telegram-bot.js` — **732 lines**
- `src/openclaw/gateway.js` — **529 lines**

When editing any of these, hand Codex only the target function(s)/region plus the relevant
REPO-MAP rows — never the whole file.
