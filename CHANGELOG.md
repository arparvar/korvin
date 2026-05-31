# Changelog

## [1.0.0] - 2026-05-31

### Added
- One-command install via install.sh for Ubuntu 24.04 (Task 2)
- 5 skills: web research, scheduling, document drafting, security reporting, inbox triage (Task 3)
- Per-user rate limiting: 20 requests per 60 seconds (Task 6)
- Quickstart guide in English (quickstart.md) and Spanish (quickstart-es.md) (Task 4)
- Automated smoke test: test/smoke.sh (Task 7)

### Security
- OWASP LLM Top 10 2025 review (Task 5)
- Prompt injection blocking via defender.js
- Output redaction via sanitizer.js
- LiteLLM service runs as korvin user (not root)
- LiteLLM port bound to 127.0.0.1 only in install.sh

### Fixed
- Hardcoded /home/korvin/korvin paths replaced with relative paths (Task 1)
- express and node-telegram-bot-api declared as runtime dependencies in package.json
