# TASK-G12 Report

- File modified: `src/openclaw/telegram-bot.js`
- Node check status: `node --check korvin/src/openclaw/telegram-bot.js` exited 0 with no output.

Supertonic TTS was added inside `generateSpeech(text, outputPath)` behind `KORVIN_TTS_PROVIDER=supertonic`, immediately after the existing Markdown-stripped `ttsText` is computed. The branch POSTs `{ model, input, voice, response_format }` to `KORVIN_TTS_URL` or the default local Supertonic endpoint, writes successful audio bytes to `outputPath`, and resolves normally. Any non-OK response or fetch error logs `[Korvin] Supertonic TTS failed, falling back to Kokoro:` and then continues into the existing Python/Kokoro exec path, preserving Kokoro rejection behavior.
