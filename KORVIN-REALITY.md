# Korvin Reality Report v1.0.0

Date: 2026-05-31

## 1. What Korvin Is

Korvin is a self-hosted personal AI agent that runs on a small Ubuntu VPS. In v1.0.0 it is a Telegram bot plus a FastAPI web dashboard, backed by a LiteLLM proxy that routes model calls to DeepSeek and Gemini. It stores conversation history in SQLite, exposes basic operational controls through the dashboard, and includes a small skills dispatcher for common personal-agent tasks.

The practical problem Korvin solves today is simple: one operator can run their own AI assistant with persistent memory, model routing, Telegram access, a protected dashboard, rate limiting, prompt-injection defenses, and a few useful built-in actions without depending on a hosted agent platform. It is not a full autonomous operating system. It is a working agent shell with bounded skills, a memory database, dashboard controls, and live VPS deployment scripts.

Korvin v1.0.0 is live and has passed the 10-item smoke test on the VPS. The current implementation is production-shaped but still early: the live bot and dashboard work, the five skills route correctly, and the security baseline is in place, while several roadmap items remain stubs or future integrations.

## 2. Architecture

High-level runtime shape:

```text
Telegram
  -> Telegram Bot (Node.js, no inbound port)
  -> Gateway (src/openclaw/gateway.js)
  -> Input sanitizer
  -> Defender
  -> Skills dispatcher
       -> web research
       -> scheduling
       -> document draft
       -> security report
       -> inbox stub
  -> LiteLLM proxy (127.0.0.1:4000 target architecture)
  -> DeepSeek / Gemini
  -> SQLite memory (data/memory.db)

Dashboard browser
  -> Cloudflare Access
  -> FastAPI Dashboard (127.0.0.1:3002)
  -> X-Korvin-Key protected API endpoints
  -> Dashboard chat flow
       -> in-memory rate limiter
       -> prompt-injection check
       -> skills dispatcher through Node subprocess
       -> LiteLLM proxy (127.0.0.1:4000 target architecture)
       -> SQLite memory (data/memory.db)

Rate Limiter
  -> in-memory sliding window
  -> 20 requests per 60 seconds per user/session

Defender
  -> strips invisible Unicode injection characters
  -> blocks known prompt-injection and system-prompt leakage patterns
  -> wraps suspicious role/delimiter content with a warning

Persistence
  -> data/memory.db for chat history
  -> data/cron_jobs.json for scheduled skill jobs
  -> data/active_model.txt for selected model
  -> data/token_usage.json for token accounting
  -> data/security_monitor_chat.txt for security-monitor destination
```

Installed services from `install.sh`:

```text
korvin.service
  Node.js Telegram bot
  ExecStart: node src/openclaw/telegram-bot.js
  User: korvin
  Port: none

korvin-dashboard.service
  FastAPI dashboard through uvicorn
  Host: 127.0.0.1
  Port: 3002
  User: korvin

litellm.service
  LiteLLM proxy
  Host in current installer: 127.0.0.1
  Port: 4000
  User/Group: korvin
```

The Telegram path uses `src/openclaw/gateway.js` as the main message gateway. The dashboard path implements the same practical flow in Python: it checks rate limits, blocks injection patterns, calls `src/skills/dispatcher.js` through a Node subprocess, and then calls LiteLLM directly if no skill matches. So the dashboard participates in the same logical gateway behavior, but it does not currently import `gateway.js` directly.

The gateway flow is:

```text
message
  -> sanitize input
  -> defend against prompt injection
  -> redact sensitive-looking text before storage/use
  -> dispatchSkill()
  -> if a skill matches, save user and assistant messages to SQLite
  -> if no skill matches, load recent memory
  -> call LiteLLM with active model and max_tokens=2048
  -> redact assistant output
  -> track token usage
  -> save conversation to SQLite
  -> return reply
```

## 3. The 5 Skills

All five skills live in `src/skills/dispatcher.js` and are selected by regular-expression keyword routing before the normal LLM chat path.

### 1. Web Research

Trigger:

```text
research <topic>
```

What it does:

Korvin calls the web research helper for the requested topic, then sends the raw research results through LiteLLM with a synthesis prompt. The requested output shape is a brief structured report with Summary, Key Findings, Sources, and Uncertainty. The skill uses the active model from `data/active_model.txt`, defaulting to `deepseek-v4-pro`, and caps output with `max_tokens=2048`.

Example input:

```text
research AI agent security trends
```

Expected output:

```text
Summary
AI agent security is focused on prompt injection, tool permissions, data leakage, and monitoring.

Key Findings
- Prompt injection remains a primary risk for agents that read web pages, emails, files, or API responses.
- Tool access should be constrained and audited because model output can influence actions.
- Self-hosted systems still need rate limits, secret redaction, and bounded memory.

Sources
- Source list depends on the search results returned at runtime.

Uncertainty
Search quality and source freshness depend on the research helper results available during the call.
```

The exact text varies because the skill depends on live search results and model synthesis.

### 2. Scheduling

Triggers:

```text
every <schedule> do <action>
every <schedule> remind me to <action>
remind me to <action> every <schedule>
```

What it does:

Korvin converts a small fixed set of schedule words into cron expressions and writes the job into `data/cron_jobs.json`. The supported schedule inputs are `daily`, `every day`, `hourly`, `weekly`, `Monday`, and `Mon`. Unsupported schedules do not create a job and return a capability message.

Example input:

```text
every Monday do review my goals
```

Expected output:

```text
Scheduled: review my goals at 0 9 * * 1. ID: job-<generated-id>. Cancel with: /cancel job-<generated-id>
```

Example unsupported input:

```text
every Friday do send report
```

Expected output:

```text
I can schedule daily, every day, hourly, weekly, Monday, or Mon right now.
```

### 3. Document Drafting

Trigger:

```text
write a <doctype> about <topic>
write an <doctype> on <topic>
write a <doctype> for <topic>
write a <doctype> to <topic>
```

What it does:

Korvin calls LiteLLM with a professional-writing system prompt. It asks for a complete polished draft, clear sections, and placeholders such as `[Name]` and `[Date]` where appropriate. The doctype and topic are extracted from the user message.

Example input:

```text
write a proposal about a customer support automation pilot
```

Expected output:

```text
# Customer Support Automation Pilot Proposal

Prepared for: [Recipient Name]
Prepared by: [Your Name]
Date: [Date]

## Executive Summary
This proposal outlines a pilot program to automate selected customer support workflows...

## Objectives
- Reduce response time for common support requests.
- Improve consistency in first-line support answers.
- Escalate complex cases to human staff with context.

## Scope
...
```

The exact draft varies by model output, but the skill should return a complete document rather than a short chat answer.

### 4. Security Report

Triggers:

```text
security report
check vps
check security
check service
check services
```

What it does:

Korvin runs fixed local health commands with a five-second timeout. It checks disk percentage with `df`, memory usage with `free`, and service status for `korvin.service`, `korvin-dashboard.service`, and `litellm.service`. It does not run user-supplied shell commands.

Example input:

```text
security report
```

Expected output:

```text
VPS Report 2026-05-31T13:41:15.240Z
Disk: 60%
RAM: 2227m/7940m
Services: all active
No external threat feed in v1.0.
```

The timestamp, disk, RAM, and service status values depend on the live VPS.

### 5. Inbox Stub

Triggers:

```text
summarize inbox
check my inbox
show email
show my mail
```

What it does:

Korvin recognizes inbox/email/mail requests, but real email integration is not implemented in v1.0.0. This route is intentionally a stub and returns a fixed message.

Example input:

```text
check my inbox
```

Expected output:

```text
Email integration is not configured yet. This feature requires OAuth setup with Gmail or Outlook. It will be available in v1.1.
```

## 4. Security Posture

Current protections:

- Telegram bot has no inbound port.
- Dashboard is intended to sit behind Cloudflare Access.
- Dashboard API routes that mutate or expose protected data require `X-Korvin-Key`.
- LiteLLM is authenticated with a bearer key.
- Fresh installs bind dashboard and LiteLLM to loopback in `install.sh`.
- Services run as the `korvin` Linux user, and LiteLLM runs as `korvin:korvin`.
- User input is capped at 2000 characters in the JS gateway sanitizer.
- LiteLLM calls are capped with `max_tokens=2048`.
- Sensitive-looking output is redacted before gateway return/storage and dashboard error/log display.
- Prompt-injection patterns are blocked before normal LLM calls.
- Conversation memory loaded into context is bounded.
- Skills are explicit regex routes, not an unrestricted action planner.

OWASP LLM Top 10 2025 status:

| OWASP item | Status | Current reality |
|---|---|---|
| LLM01 Prompt Injection | PASS | `sanitizer.js`, `defender.js`, gateway, and dashboard block common jailbreak and system-prompt leakage requests. Suspicious role/delimiter content is wrapped with a warning. |
| LLM02 Sensitive Information Disclosure | PARTIAL | Secret-looking strings, bearer tokens, key assignments, and emails are redacted in key response/log paths. This does not yet cover every possible PII format or business-specific sensitive data type. |
| LLM03 Supply Chain | PARTIAL | Direct npm dependency versions are pinned and `package-lock.json` exists. A follow-up `npm install` and `npm audit` pass should be run after dependency changes. |
| LLM04 Data and Model Poisoning | PASS | Memory context is bounded by recent history limits, and the dashboard exposes memory limit/prune controls. No training or fine-tuning path exists in v1.0.0. |
| LLM05 Improper Output Handling | PASS | Dashboard rendering was reviewed for escaping, and log/reply output receives secret redaction before display. |
| LLM06 Excessive Agency | PASS | Skills are fixed routes. Security reporting uses fixed commands only. No arbitrary user command execution path was found in the reviewed dispatcher/gateway/dashboard flow. |
| LLM07 System Prompt Leakage | PASS | The system prompt is not exposed by an endpoint, and direct reveal/show/print/dump system-prompt requests are blocked. |
| LLM08 Vector and Embedding Weaknesses | NOTE | No vector database, embedding store, or RAG retrieval path exists yet, so this risk is not active in v1.0.0. It will become relevant when local-document RAG is added. |
| LLM09 Misinformation | PARTIAL | The research skill asks for sources and uncertainty, but source extraction and quality scoring are still basic. Reports should be treated as assistant research, not verified ground truth. |
| LLM10 Unbounded Consumption | PASS | Rate limiting is active at 20 requests per 60 seconds per user/session, input length is capped, history is bounded, and model output is capped. |

Rate limiting:

```text
Limit: 20 requests
Window: 60 seconds
Scope: per Telegram user ID or dashboard chat/session ID
Storage: in-memory sliding window
Failure response: blocked request with retry-after timing where implemented
```

One open network exposure gap:

```text
Live VPS gap: LiteLLM is still listening on 0.0.0.0:4000.
Expected fixed state: LiteLLM listens only on 127.0.0.1:4000.
Fix: sudo bash scripts/fix-litellm-port.sh
```

The current `install.sh` already writes fresh LiteLLM installs with `--host 127.0.0.1 --port 4000`, but the live VPS still needs the port-binding fix applied.

## 5. What Is NOT Done

The following roadmap items are not implemented as working v1.0.0 features:

- Docker install: `docker-compose.yml` exists, but the Docker path has not been tested end-to-end from a clean state.
- WhatsApp channel: not implemented.
- Discord channel: not implemented.
- Signal channel: not implemented.
- RAG over local documents: not implemented. There is no vector database, embedding index, or document retrieval pipeline yet.
- Wake-word voice client: not implemented.
- Multi-agent orchestration: not implemented. Korvin has a single dispatcher with fixed skills, not a multi-agent planner.
- Real inbox integration: not implemented. The inbox skill is a stub that requires future Gmail or Outlook OAuth setup.

Additional honest notes:

- The dashboard `/api/status` endpoint currently reports `"version":"0.1.1"` even though the package release is v1.0.0.
- Dashboard chat duplicates gateway behavior in Python instead of sharing the JS `gateway.js` module directly.
- The research skill asks for sources and uncertainty, but it should preserve cleaner source URLs in future versions.
- The in-memory rate limiter resets on service restart. That is acceptable for v1.0.0 on a single VPS, but it is not distributed.

## 6. How to Run It

Use `quickstart.md` for the operator path from a fresh Ubuntu 24.04 VPS.

Run `install.sh` as root; it installs system packages, creates the `korvin` user, prompts for required secrets, writes config files, and starts `korvin.service`, `korvin-dashboard.service`, and `litellm.service`.

After install, verify the services with `systemctl is-active`, test the dashboard at `http://127.0.0.1:3002/api/status`, and use Telegram or the Cloudflare-protected dashboard to talk to Korvin.
