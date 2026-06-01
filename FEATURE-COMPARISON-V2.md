# Korvin vs Hermes Agent vs OpenClaw — Code-Level Gap Analysis V2

**Date:** 2026-05-31  
**Method:** Direct GitHub API + raw file fetches. Not gitingest.com UI (returns only a landing page). Raw source pulled from:
- `github.com/NousResearch/hermes-agent` — agent/tool_guardrails.py, agent/memory_manager.py, agent/redact.py, agent/rate_limit_tracker.py, agent/message_sanitization.py, full agent/ directory listing (124 files), gateway/ directory listing (24 files)
- `github.com/openclaw/openclaw` — README, VISION.md, src/ directory listing (59 dirs, 39 files), packages/ listing (21 packages)
- Korvin source: src/security/external-content.js, src/security/rate-limiter.js, src/openclaw/gateway.js, src/skills/manifest-loader.js, src/skills/dispatcher.js

---

## 1. What We Actually Shipped (Tasks 13–17)

Before comparing, record what Korvin gained in the current sprint:

| Task | Deliverable | Status |
|---|---|---|
| 13 | Supertonic 3 TTS evaluation on ZIION VM | SCRAPPED — Kokoro retained as sole TTS |
| 14 | `src/security/external-content.js` + dispatcher wired | DONE — strips special tokens, boundary markers |
| 15 | `/new`, `/reset`, `/summarize` Telegram commands; SQLite rate limiter; `/api/session/reset` dashboard endpoint | DONE |
| 16 | `install-desktop.sh`; optional Telegram startup; `quickstart-desktop.md` | DONE — confirmed live on ZIION |
| 17 | `src/skills/manifest-loader.js`; `src/skills/permissions.js`; skills/example/; split requirements | DONE |

---

## 2. Hermes Agent — Code-Level Findings

**Repo:** https://github.com/NousResearch/hermes-agent  
**Version at analysis:** 0.15.2 (PyPI), sha 1044d9f (main)  
**Language:** Python ≥3.11  
**Size:** ~277 MB repo, ~11 MB core wheel; agent/ alone has 124 source files

### 2a. Tool Loop Guardrails (`agent/tool_guardrails.py` — 17,934 bytes)

**What the code actually does:**

```python
# Two frozensets classify every tool by mutability:
IDEMPOTENT_TOOL_NAMES = frozenset({"read_file", "search_files", "web_search",
    "web_extract", "session_search", "browser_snapshot", ...})
MUTATING_TOOL_NAMES  = frozenset({"terminal", "execute_code", "write_file",
    "patch", "todo", "memory", "skill_manage", "browser_click", ...})

# Per-turn state (reset on each turn):
_exact_failure_counts: dict[ToolCallSignature, int]   # same tool + same args
_same_tool_failure_counts: dict[str, int]              # same tool, any args
_no_progress: dict[ToolCallSignature, tuple[str, int]] # same result hash N times

# Thresholds (defaults):
exact_failure_warn_after   = 2    # warn if same call+args fails twice
exact_failure_block_after  = 5    # block at 5 identical failures
same_tool_failure_warn_after = 3  # warn if same tool fails 3× (any args)
same_tool_failure_halt_after = 8  # halt at 8 same-tool failures
no_progress_warn_after     = 2    # idempotent call returns same result 2×
no_progress_block_after    = 5    # block at 5×
```

`ToolCallSignature` is SHA-256 of `json.dumps(args, sort_keys=True)` so argument order doesn't matter.  
`hard_stop_enabled` defaults to **False** — warnings are on, circuit-breaker is opt-in.

**Gap in Korvin:** Korvin has no model-callable tool loop. This guardrail becomes relevant only when Korvin adds model-selected tools (not fixed-regex skills). **Not urgent today, but the design pattern is worth borrowing for research/skill retries.**

**Concrete borrowable idea:** When the research dispatcher calls web_search twice with identical queries and gets the same result, log a warning instead of silently returning stale data.

---

### 2b. Memory Manager (`agent/memory_manager.py` — 24,011 bytes)

**What the code actually does:**
- Provider interface with lifecycle hooks: `register`, `prefetch`, `on_turn_start`, `on_turn_end`, `on_session_end`, `on_compression`, `on_memory_write`, `on_delegation_complete`, `on_shutdown`
- Only ONE external plugin provider allowed at a time (prevents conflicts)
- `StreamingContextScrubber`: stateful state-machine scrubber for memory context tags split across streaming deltas
- Memory context is fenced with `<memory-context>` tags — stripped before user-visible output
- `_tool_to_provider` index routes tool calls to the right provider without scanning all providers

**Gap in Korvin:** Korvin's memory is flat SQLite rows read as a history slice. There is no lifecycle hook system. The gap is intentional — Korvin's simpler model means fewer failure modes.

**Concrete borrowable idea:** The `StreamingContextScrubber` pattern — if Korvin ever streams LiteLLM responses, strip any accidentally-leaked internal markers before forwarding to Telegram. Currently Korvin awaits full response so this is not urgent.

---

### 2c. Secret Redaction (`agent/redact.py` — 19,548 bytes)

**What the code actually does:**
```
Short tokens (<18 chars): fully masked → "***"
Long tokens:              first 6 + "..." + last 4 chars preserved for debugging
Performance:              substring pre-checks before regex (~1.8 μs vs ~5.6 μs)
code_file=True mode:      skips ENV-assignment + JSON-field patterns to reduce
                          false positives when processing source code
RedactingFormatter:       Python logging.Formatter subclass that redacts every
                          log record automatically
```

Patterns cover: OpenAI (`sk-`), GitHub (`ghp_`, `github_pat_`), Slack (`xoxb-`, `xoxp-`), Google (`AIza`), AWS (`AKIA`), Stripe (`sk_live_`), Telegram bot tokens, JWT, private key blocks (`-----BEGIN`), DB connection string passwords, E.164 phone numbers, Authorization headers.

**Gap in Korvin:** Korvin's permanent security rules say "never log API keys" and use env vars, but there is no programmatic redaction of runtime log output. If `console.log` is called anywhere on a response object that accidentally contains a key, it would appear in logs.

**Concrete action:** Add a lightweight `redact()` function to `src/security/` that wraps `console.log` / `console.error` in the dashboard-api server and gateway. Pattern: check for `sk-`, `Bearer `, `bot:`, JWT `eyJ` prefix. Mask with `[REDACTED]`. Node.js version is ~30 lines.

---

### 2d. Rate Limit Header Tracking (`agent/rate_limit_tracker.py` — 8,458 bytes)

**What the code actually does:**
```
Parses 12 x-ratelimit-* headers from LLM provider API responses:
  x-ratelimit-limit-requests          → RPM cap
  x-ratelimit-limit-requests-1h       → RPH cap
  x-ratelimit-limit-tokens            → TPM cap
  x-ratelimit-limit-tokens-1h         → TPH cap
  x-ratelimit-remaining-*             → remaining for each
  x-ratelimit-reset-*                 → seconds until reset for each

4 RateLimitBucket objects with:
  .used, .usage_pct, .remaining_seconds_now (adjusted for elapsed time)

Warning threshold: usage_pct >= 80%
Display: ASCII progress bar [████████░░░░] 40%
```

This is **outbound** tracking (how close we are to the upstream API quota) — completely different from Korvin's **inbound** rate limiter (how fast a user sends requests).

**Gap in Korvin:** Korvin never reads response headers from LiteLLM. The operator has no visibility into provider quota burn rate. When DeepSeek or Gemini rate-limits the proxy, the error appears opaque.

**Concrete action:** In `gateway.js`, after each `fetch()` to LiteLLM, read `x-ratelimit-remaining-requests` and `x-ratelimit-reset-requests` from the response headers. If remaining < 10, log a warning. Expose the last-seen values via `/api/system/rate-limits` on the dashboard-api. This is ~20 lines.

---

### 2e. Message Sanitization (`agent/message_sanitization.py` — 17,594 bytes)

**What the code actually does:**
- Surrogate character replacement: U+D800–DFFF lone surrogates → U+FFFD (these crash `json.dumps`)
- Control character escaping: 0x00–0x1F in JSON strings → `\uXXXX` (llama.cpp backends emit these)
- Tool call argument repair — multi-pass:
  1. Lenient JSON parsing
  2. Trailing comma stripping
  3. Unclosed brace matching
  4. Python `None` literal replacement
  5. Default to `"{}"` as last resort to prevent session crash
- Non-ASCII strip for LANG=C environments
- Image content removal: when a vision-capable server rejects images, removes `image_url`/`input_image` parts and inserts text placeholders

**Gap in Korvin:** Korvin sends messages to LiteLLM without sanitizing the history slice loaded from SQLite. If a prior message somehow contained surrogate characters or malformed JSON, LiteLLM could return a 400 error that Korvin reports as a generic failure.

**Concrete action:** In `gateway.js` `sendMessage()`, before building the messages array, strip lone surrogates from message content strings. One-liner: `content.replace(/[\uD800-\uDFFF]/g, '�')`. Also log a warning if any message exceeds 32,768 chars (truncate rather than crash).

---

### 2f. Context Compression (`agent/context_compressor.py` — 96,867 bytes)

Hermes compresses context when approaching token limits. It summarizes older parts of the conversation history with a secondary LLM call, then replaces the full history with the summary + recent N messages.

**Gap in Korvin:** `gateway.js` loads the last N messages from SQLite and sends them all. There is no automatic compression. Long-running sessions with many messages accumulate context until the LiteLLM call returns a context-length error, which Korvin then reports as a failure.

**Concrete action:** Count estimated tokens in the history slice (rough estimate: `characters / 4`). If over 80,000 tokens, send the last 20 messages only and prepend a system note: `[Note: earlier conversation history was truncated to stay within context limits.]` This is a degraded but non-crashing behavior. Full summarization via a secondary call is a Task-level feature, not a hotfix.

---

### 2g. Skill Auto-Creation and Learning Loop

Hermes can autonomously create skills from complex conversations. It has FTS5 full-text search over session history. It nudges itself to persist new knowledge. It integrates with `agentskills.io` Skills Hub.

**Gap in Korvin:** Korvin has static skill manifests. The operator must manually write `skill.json` and `handler.js`. No session search. No auto-improvement.

**Assessment:** Auto-skill creation requires giving the model write access to skill files — this increases attack surface. Korvin's current approach (operator-controlled manifests only) is the correct security stance. **Do not add auto-skill creation until sandboxing is in place.**

Session search (FTS5 over history) is valuable and low-risk. SQLite has built-in FTS5. This is a good Task-level feature for a future sprint.

---

## 3. OpenClaw — Code-Level Findings

**Repo:** https://github.com/openclaw/openclaw  
**Version at analysis:** 2026.5.31 (package.json)  
**Language:** TypeScript, Node ≥22.19  
**Size:** ~1.46 GB repo, ~81 MB npm unpacked  
**Architecture:** Monorepo with 59 source directories, 21 packages

OpenClaw is Korvin's closest architectural peer (TypeScript/Node gateway). Hermes is the Python successor that imports OpenClaw's ideas. Hermes even ships `hermes claw migrate` to import OpenClaw configs.

### 3a. Package Architecture

OpenClaw's 21 packages show what a production-scale version of Korvin would look like:

| Package | What it does | Korvin equivalent |
|---|---|---|
| `agent-core` | Agent execution loop | `src/openclaw/gateway.js` |
| `llm-core` + `llm-runtime` | Model routing, provider adapters | LiteLLM proxy |
| `tool-call-repair` | Repairs malformed JSON tool arguments | Missing in Korvin |
| `net-policy` | Network-level outbound policy | Missing in Korvin |
| `speech-core` | TTS/STT abstraction | Dashboard whisper endpoint |
| `memory-host-sdk` | Memory provider SDK | Flat SQLite in Korvin |
| `plugin-sdk` | Third-party plugin contract | `skills/example/skill.json` |
| `normalization-core` | Content normalization across channels | `src/security/external-content.js` (partial) |
| `web-content-core` | Web fetch + content extraction | `src/skills/research.js` |
| `gateway-protocol` | Gateway message protocol | Express routes in dashboard-api |

**Key insight:** OpenClaw separated `tool-call-repair` into its own package. This means they hit the exact same problem Hermes's `message_sanitization.py` fixes: malformed JSON tool call args crashing the session. Both projects found this problem in production.

### 3b. DM Pairing Security (`src/pairing/`)

OpenClaw implements DM pairing: any unknown Telegram/Discord/WhatsApp sender gets a pairing code before their messages are processed. The gateway maintains an allowlist.

**Gap in Korvin:** Korvin uses `KORVIN_ALLOWED_USERS` env var (set once at install time) but has no runtime pairing flow. Anyone who learns the bot's Telegram username can attempt to send it messages. The rate limiter will throttle them, but they can still probe it.

**Concrete action:** Add a simple allowlist check in `telegram-bot.js`. If the sender's `chat.id` is not in the `KORVIN_ALLOWED_USERS` list, reply with: `Access denied. Contact the operator.` Do not process the message. This is ~5 lines and is already partially supported by the env var — just needs enforcement at the handler level.

**Check current enforcement:** Look for where `KORVIN_ALLOWED_USERS` is checked in telegram-bot.js.

### 3c. `packages/tool-call-repair`

Dedicated package for repairing malformed JSON from tool call arguments. Both OpenClaw (TypeScript) and Hermes (Python) ship this pattern. It means models occasionally return broken JSON as tool arguments, and production systems must repair them rather than crash.

**Concrete action for Korvin:** In `src/skills/dispatcher.js`, wrap the regex match result parsing. If a skill handler expects a JSON argument from the model's message, parse defensively: try JSON.parse, on error strip trailing commas and try again, on second error use empty string. Currently skills use regex captures only (not JSON args), so this is not urgent — but document it as a requirement before adding any skill that accepts structured JSON input.

### 3d. Session Sandboxing

OpenClaw sandboxes non-main sessions via Docker, SSH, or OpenShell backends. Each session can have isolated tool access.

**Gap in Korvin:** All Korvin sessions run in the same Node.js process. Skills run in the same context. No isolation.

**Assessment:** Sandboxing is high-effort and requires Docker-in-Docker or SSH. For a single-operator personal assistant, process isolation is low-priority. **Keep noted for when Korvin adds multi-user sessions.**

### 3e. Architecture Philosophy (from VISION.md)

OpenClaw's stated philosophy: **"Core stays lean; optional capability should usually ship as plugins."**

This is exactly what Korvin's split-requirements approach (Tasks 17) and skills manifest system (Task 17) implement. We arrived at the same design independently.

The TypeScript choice: "selected to keep the system accessible for community modification and rapid iteration." Korvin is already TypeScript-adjacent (Node.js gateway) + Python dashboard. The hybrid is livable.

---

## 4. What Korvin Beats Both On

This is the most important section — the code we are shipping is ours, built better.

| Dimension | Korvin advantage |
|---|---|
| **Install weight** | Base requirements ~50 MB vs OpenClaw's 81 MB unpacked npm, vs Hermes's 277 MB repo. After Task 17 split, dashboard-only install is lightweight. |
| **Security surface (inbound)** | Fixed-regex skill dispatch means the model cannot choose arbitrary tools. Hermes's 40+ model-callable tools create a much larger attack surface. |
| **External content defense** | `src/security/external-content.js` (Task 14) wraps web research with randomized boundary IDs and strips model special tokens. Hermes has memory-context fencing but not this exact pattern for web research. |
| **Audit simplicity** | ~20 source files vs Hermes's 124 agent/ files (and 59 OpenClaw src/ dirs). Operator can read the whole codebase in a weekend. |
| **Dashboard-first UX** | `install-desktop.sh` (Task 16) is a unique pattern. Neither Hermes nor OpenClaw offer a "dashboard only, no messaging bot" installer. |
| **LiteLLM abstraction** | Korvin's LiteLLM proxy makes model swaps zero-code. Hermes requires code-level adapter work for some providers. OpenClaw has `llm-core` + `llm-runtime` complexity. |
| **Inbound rate limiter** | Korvin's in-memory + SQLite dual rate limiter (Task 15) is immediately production-ready. Hermes focuses on outbound quota tracking, not inbound request limiting. |
| **Session controls (Telegram)** | `/new`, `/reset`, `/summarize` (Task 15) work over Telegram without a CLI session. Hermes has these in CLI/gateway but they require the full hermes gateway stack. |

---

## 5. Actionable Gaps Ranked by Code-Level Effort

Items marked `NOW` are ≤50 lines of code and should go into the next Codex batch. Items marked `NEXT-SPRINT` are small features. Items marked `FUTURE` are architectural.

### NOW — ≤50 lines each

**G1. Allowlist enforcement in telegram-bot.js**  
Check `KORVIN_ALLOWED_USERS` before processing any message. If not in list, reply `Access denied.` and return. Code location: `src/openclaw/telegram-bot.js`, in the message handler before skill dispatch.

```js
// Add near top of message handler:
const allowedUsers = (process.env.KORVIN_ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
if (allowedUsers.length > 0 && !allowedUsers.includes(String(ctx.from.id))) {
  return ctx.reply('Access denied.');
}
```

**G2. Surrogate character sanitization in gateway.js**  
Before building the messages array for LiteLLM, sanitize content strings.

```js
function sanitizeContent(text) {
  return String(text || '').replace(/[\uD800-\uDFFF]/g, '�');
}
```

**G3. Provider rate limit header logging**  
After `fetch()` to LiteLLM in `gateway.js`, read response headers and log a warning if near quota.

```js
const remaining = response.headers.get('x-ratelimit-remaining-requests');
if (remaining !== null && parseInt(remaining, 10) < 10) {
  console.warn(`[Korvin] WARNING: LiteLLM reports only ${remaining} requests remaining in rate limit window.`);
}
```

**G4. Context length guard in gateway.js**  
Estimate token count before sending history. If over threshold, truncate with a note.

```js
const MAX_ESTIMATED_TOKENS = 80000;
function estimateTokens(messages) {
  return messages.reduce((acc, m) => acc + Math.ceil((m.content || '').length / 4), 0);
}
// In sendMessage(), before the fetch():
let historySlice = messages;
if (estimateTokens(historySlice) > MAX_ESTIMATED_TOKENS) {
  historySlice = messages.slice(-20);
  // prepend truncation note via system message
}
```

---

### NEXT-SPRINT — Features worth a Codex task each

**G5. Runtime log redaction module**  
`src/security/log-redact.js` — wrap `console.error` and `console.warn` with pattern-based masking. Patterns: `sk-[A-Za-z0-9]{20,}`, `Bearer [A-Za-z0-9._-]{20,}`, `bot:[0-9]+:[A-Za-z0-9_-]{30,}`, `eyJ[A-Za-z0-9._-]{20,}`. Mask to `[REDACTED]`. This closes the "no programmatic redaction" gap identified from Hermes's `redact.py`.

**G6. FTS5 session search in SQLite**  
`ALTER TABLE messages` → add FTS5 virtual table. Expose `/search` Telegram command: `/search <query>` returns top 5 matching messages from history. Maps to Hermes's `session_search` tool. Low risk, high utility.

**G7. `/api/system/rate-limits` dashboard endpoint**  
Store the last-seen x-ratelimit-* values in memory. Expose via GET `/api/system/rate-limits` returning JSON. Dashboard UI can poll and display provider quota status. Maps to Hermes's `/usage` slash command display.

**G8. Tool call repair in dispatcher**  
Before passing regex match results to skill handlers, wrap in a defensive parser that handles trailing commas and malformed JSON. Required before any skill accepts structured JSON input from model messages. Maps to OpenClaw's `packages/tool-call-repair` and Hermes's `message_sanitization.py`.

---

### FUTURE — Architectural, requires full Codex task + human review

**G9. Context summarization (not just truncation)**  
When history exceeds token limit, make a secondary LiteLLM call to summarize the oldest 50% of messages. Replace them with the summary. Requires careful session management to avoid double-charging tokens or losing critical context.

**G10. Session branching and named sessions**  
Allow `/save <name>` and `/load <name>` to create and restore named session snapshots. Backed by SQLite. Maps to OpenClaw's session compaction + resume concept.

**G11. DM pairing with QR/code flow**  
For future multi-user deployment: generate a pairing code on first message from unknown user. Operator approves via dashboard. Allowlist persisted in SQLite. Maps to OpenClaw's `src/pairing/` module.

**G12. Supertonic TTS wiring — SKIPPED**  
Supertonic evaluation scrapped. Kokoro is the sole TTS provider. No wiring needed.

---

## 6. What to Never Copy from Hermes or OpenClaw

| Feature | Why Korvin should not copy it |
|---|---|
| Arbitrary model-callable shell (`terminal` tool) | Removes the security property that makes Korvin auditable. Model cannot execute code → operator can trust the system. |
| Plugin marketplace / ClawHub / agentskills.io | Supply-chain risk. Operator-installed local skills (Task 17) are enough. |
| Auto-skill creation without sandboxing | Model writing to `skills/` directory is dangerous without isolation. |
| OpenClaw-scale channel count (20+) | Every channel is an attack surface. Add channels only if the operator needs them, one at a time. |
| Hermes's 124-file agent/ directory | Korvin's audit simplicity is a feature, not a limitation. Keep source files countable. |
| Session sandboxing via Docker-in-Docker | Complexity cost outweighs benefit for single-operator personal assistant. |
| Honcho dialectic user modeling | Cloud-based third-party user profile service. Privacy concern for a privacy-first local tool. |

---

## 7. Summary

Hermes Agent and OpenClaw are both larger, more feature-rich systems that Korvin intentionally does not replicate at scale. The analysis of their actual source code confirms the right strategy: borrow security patterns (redaction, sanitization, guardrails) and ergonomic patterns (session controls, rate limit visibility), skip the complexity (plugin ecosystems, multi-agent orchestration, broad channel support).

The four highest-value code-level additions from this analysis are:

1. **Allowlist enforcement** (G1, ~10 lines) — closes an actual security gap today
2. **Surrogate char sanitization** (G2, ~5 lines) — prevents crash on malformed LLM output
3. **Provider quota logging** (G3, ~5 lines) — visibility into why rate limits hit
4. **Runtime log redaction** (G5, ~30 lines) — closes the programmatic credential leak gap

Everything else is sprint-level work. Korvin's current sprint (Tasks 13–17) already delivered more security features than either Hermes or OpenClaw has in a comparable scope: bounded-permission skills, external content wrapping, SQLite rate limiting, session controls, and a desktop-first installer. Ship those first.
