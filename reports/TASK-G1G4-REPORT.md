# TASK-G1G4 Report

## Files modified
- `src/openclaw/telegram-bot.js`
- `src/openclaw/gateway.js`
- `reports/TASK-G1G4-REPORT.md`

## Check status
- `node --check korvin/src/openclaw/telegram-bot.js`: PASS, exit 0, no output.
- `node --check korvin/src/openclaw/gateway.js`: PASS, exit 0, no output.

## Changes
- G1: Added `isAllowed(msg)` near the top of `telegram-bot.js` and enforced it at the start of the text and voice `bot.on(...)` handlers.
- G2: Added `sanitizeContent(text)` in `gateway.js` and applied it to history message content plus the final user message content in `sendMessage`.
- G3: Added provider `x-ratelimit-remaining-requests` warning logging immediately after successful LiteLLM fetches in `sendMessage`.
- G4: Added `estimateTokens(messages)` in `gateway.js` and a context-length guard in `sendMessage` that truncates to the last 20 history messages when estimated context exceeds 80000 tokens.
