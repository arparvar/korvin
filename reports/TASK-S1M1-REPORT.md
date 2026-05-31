# TASK-S1M1 Report

## Changes Confirmed

- Change 1: Replaced `voice_status()` with Supertonic-only status response.
  - Lines: `90-105`
- Change 2: Injected active model label into `/api/chat` system prompt.
  - Lines: `479-489`
- Change 3: Injected active model label into `/api/voice/chat` system prompt.
  - Lines: `717-727`
- Change 4: Removed Kokoro provider guard from `/api/voice/chat` TTS section; Supertonic TTS now runs directly.
  - Lines: `782-803`

## Validation

- Command: `python -m py_compile korvin/src/dashboard/main.py`
- Exit code: `0`
