# Changelog

## [1.2.0] - 2026-05-31

### Added
- Daily digest cron — every night at 23:00 Korvin summarizes the day's session and delivers it to Telegram. The digest is also appended to MEMORY.md for long-term recall.
- Goal heartbeat — `/goal [text]` saves a goal; Korvin sends a 4-hour nudge message to keep it top of mind. Chat ID is persisted so restarts survive.
- Structured MEMORY.md — date-based section headers (`## YYYY-MM-DD`) are automatically prepended before each day's entries, making the file easy to audit by date.
- Research compressor — strips HTML markup, collapses whitespace, and caps research payloads at 8 000 characters before LLM processing. Fewer tokens, same signal.
- Cron triage noise filter — trivial cron results (under 15 characters, or apology/no-result patterns) are silently dropped. Only meaningful output reaches Telegram.

---

## [1.1.0] - 2026-05-31

### Added
- Named session save / load via `/save [name]` and `/load [name]` Telegram commands
- Context summarization — sliding window, summarize, and hard-stop memory strategies
- safeParseArg — tolerant JSON parsing so skills handle malformed input without crashing
- Kokoro TTS — local text-to-speech, no external API or cost

### Changed
- Sole TTS provider is Kokoro. No external TTS service required.
- `loadNamedSession` uses Python subprocess (sqlite3) — removes better-sqlite3 dependency on VPS
- `/save` and `/load` added to korvin.cloud command reference

### Removed
- Supertonic TTS evaluation scaffolding

---

## [1.0.0] - 2026-05-01

### Added
- One-command install via `install.sh` for Ubuntu 24.04
- 6 skills: web research, security scan, CVE patch research, activity log, daily brief, argument stress-test
- Per-user rate limiting: 20 requests per 60 seconds
- Quickstart guide (`quickstart.md`)
- Automated smoke test: `test/smoke.sh`
- FastAPI dashboard — chat, memory browser, model switcher, killswitch, token tracking
- LiteLLM proxy integration — model-agnostic routing
- Confirmation gate — HIGH-risk commands require explicit `/confirm` before executing
- Cloudflare Tunnel + Access integration for secure remote dashboard access

### Security
- OWASP LLM Top 10 2025 review
- Prompt injection blocking via `src/security/defender.js`
- Output redaction via `src/middleware/sanitizer.js`
- All services bound to `127.0.0.1` only
- API keys in `/etc/korvin.env`, never committed

### Fixed
- Hardcoded `/home/korvin/korvin` paths replaced with relative paths
- `express` and `node-telegram-bot-api` declared as runtime dependencies in `package.json`
