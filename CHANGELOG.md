# Changelog

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
