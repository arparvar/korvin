# Korvin — Claude Code Project Rules

## PRIVACY RULE — NO EXCEPTIONS

**Never display, log, print, or embed real API keys, tokens, or credentials in any output.**

This applies to:
- SSH command output (pipe through `sed 's/=.*/=***/'` or grep for key NAMES only)
- Codex prompts (never paste a real key into a prompt)
- Code comments, docs, or any file
- Tool call outputs shown to the user

All commands reading `/etc/korvin.env`, `/proc/*/environ`, or any secrets file must mask values:
```bash
# CORRECT — mask the value
cat /etc/korvin.env | sed 's/=.*/=***/'

# WRONG — shows real secrets
cat /proc/PID/environ | tr '\0' '\n' | grep KEY
```

**Treat every key as already exposed if it appears in output. Recommend rotating it.**

---

## ORCHESTRATOR RULE

Claude is the orchestrator. Codex writes production code.

- Claude writes prompts, reviews output, tests results, and commits.
- Claude does NOT write production code itself (`.js`, `.py`, `.sh` files in `src/`).
- If Claude finds itself writing more than 20 lines of production code, stop and delegate to Codex.
- Every Codex prompt must include the PRIVACY RULE above.

---

## CODEX INVOCATION — standard prompt header

Always prepend this to every Codex prompt:

```
PRIVACY RULE — NO EXCEPTIONS: Never log, print, or embed real API keys, tokens, or credentials anywhere. All commands touching secrets must use env vars.
```

Codex CLI path: `C:\Users\Asus\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe`
Flags: `-m gpt-5.5 -C <dir> --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --color never -`

---

## PROJECT CONTEXT

- Korvin = self-hosted personal AI agent on $5/month Hostinger VPS
- SSH: `korvin@72.62.173.174`
- Services: `korvin.service` (Node.js bot), `korvin-dashboard.service` (FastAPI port 3002), `litellm.service` (port 4000)
- Env file: `/etc/korvin.env` (root-owned, korvin-readable via systemd)
- Voice pipeline: VAD → Faster-Whisper STT → LLM → Kokoro TTS

## PHILOSOPHY

Original code only. MIT projects studied for ideas, never copied verbatim.
Goal: lightweight, secure, safe, easy for anyone.
