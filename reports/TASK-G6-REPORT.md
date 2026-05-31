# TASK-G6 Report

## Files Modified
- `src/openclaw/gateway.js`
- `src/openclaw/telegram-bot.js`

## Validation
- `node --check korvin/src/openclaw/gateway.js`: passed with no output.
- `node --check korvin/src/openclaw/telegram-bot.js`: passed with no output.

## Confirmation
- `searchMessages` was added in `gateway.js` beside the existing session memory helpers.
- `/search` was added in `telegram-bot.js` with the other session command handlers near `/new`, `/reset`, and `/summarize`.
