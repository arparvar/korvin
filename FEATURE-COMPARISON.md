# Korvin Feature Comparison: Hermes Agent and OpenClaw

Date: 2026-05-31

Sources reviewed:

- Hermes Agent: https://github.com/NousResearch/hermes-agent
- Hermes Agent README, `run_agent.py`, `agent/conversation_loop.py`, `agent/memory_manager.py`, `agent/tool_guardrails.py`, `agent/redact.py`, `agent/rate_limit_tracker.py`, `tools/tirith_security.py`, `pyproject.toml`, `LICENSE`
- OpenClaw: https://github.com/openclaw/openclaw
- OpenClaw README, `src/gateway/server.impl.ts`, `src/agents/agent-command.ts`, `src/agents/subagent-spawn.ts`, `src/gateway/auth-rate-limit.ts`, `src/gateway/chat-sanitize.ts`, `src/security/external-content.ts`, `src/agents/transcript-redact.ts`, `package.json`, `docker-compose.yml`, `LICENSE`
- Korvin local files: `src/openclaw/gateway.js`, `src/skills/dispatcher.js`, `src/security/defender.js`, `src/security/rate-limiter.js`, `src/middleware/sanitizer.js`, `src/dashboard/main.py`, `KORVIN-REALITY.md`, `package.json`, `requirements.txt`, `docker-compose.yml`

Notes:

- I did not install either external framework live. Install size observations use public package/repository metadata and dependency manifests.
- The requested `KhushC/hermes-agent` repo returned 404 at the GitHub API. The public agent framework found for "Hermes Agent" is `NousResearch/hermes-agent`.
- An external OpenClaw project was found at `openclaw/openclaw`. Korvin also has its own `src/openclaw/` gateway module; these are unrelated codebases that happen to share the name.

## 1. What Hermes Agent Is

Hermes Agent is a Python-first personal agent framework from Nous Research. It is designed as a self-improving agent with a CLI/TUI, messaging gateway, persistent memory, tool calling, procedural skills, subagents, cron jobs, and multiple model providers. The README describes it as an agent that "creates skills from experience, improves them during use, and runs anywhere."

Repository URL: https://github.com/NousResearch/hermes-agent

License: MIT.

Observed package/version data:

- GitHub `pyproject.toml` on `main`: `hermes-agent` 0.15.1, Python `>=3.11`.
- PyPI metadata checked on 2026-05-31: latest `hermes-agent` 0.15.2, wheel about 11.3 MB, sdist about 10.6 MB.
- GitHub repository metadata size: about 277 MB.

Dependency profile:

- Core Python dependencies include `openai`, `httpx`, `rich`, `tenacity`, `pyyaml`, `ruamel.yaml`, `requests`, `jinja2`, `pydantic`, `prompt_toolkit`, `croniter`, `PyJWT[crypto]`, and `psutil`.
- Optional extras cover Anthropic, web search providers, image generation, TTS, Modal, Daytona, messaging, Slack, Matrix, MCP, Google Workspace, YouTube, dashboard/web, voice, Bedrock, Azure identity, and more.
- The project deliberately keeps many provider/platform dependencies optional or lazy-installed.

Implementation summary:

- Main agent entry point is `run_agent.py`, which wraps `AIAgent`.
- The active turn loop is extracted into `agent/conversation_loop.py`. It handles model calls, tool execution, retries, fallback, context compression, memory sync, skill review, streaming, trajectory recording, and session persistence.
- Memory is managed through `agent/memory_manager.py`, with a provider interface, prefetch, sync, lifecycle hooks, fenced memory context blocks, and protection against leaking internal memory tags into visible output.
- Tools are model-callable. Hermes has broad toolsets: terminal, browser, files, code execution, MCP, memory, cron, delegation, web, image, TTS/STT, messaging, and skill management.
- Skills are procedural assets under `skills/` and can be managed by tools. The README also references Skills Hub compatibility.
- Multi-agent support exists through delegation/subagent tools.
- Security includes secret redaction, tool loop guardrails, command security scanning through Tirith, command approval patterns, tool output controls, URL/path safety helpers, and memory-context fencing.
- Rate-limit support is mostly provider-facing: it parses and displays provider `x-ratelimit-*` headers. It is not the same as Korvin's per-user request limiter.

## 2. What OpenClaw Is

OpenClaw is a TypeScript/Node personal AI assistant and gateway framework. It is built around a local-first Gateway that connects channels, sessions, tools, agents, companion apps, and events. It supports many messaging channels and companion nodes, including voice and device surfaces.

Repository URL: https://github.com/openclaw/openclaw

License: MIT. GitHub repository metadata reported `NOASSERTION`, but the root `LICENSE` file and `package.json` both identify MIT.

Observed package/version data:

- GitHub `package.json` on `main`: version `2026.5.31`, Node `>=22.19.0`.
- npm metadata checked on 2026-05-31: latest `openclaw` `2026.5.28`, unpacked package about 81 MB.
- GitHub repository metadata size: about 1.46 GB.

Dependency profile:

- Runtime dependencies include `express`, `ws`, `openai`, `@anthropic-ai/sdk`, `@google/genai`, `@mistralai/mistralai`, `@modelcontextprotocol/sdk`, `@agentclientprotocol/sdk`, `grammy`, `@grammyjs/runner`, `croner`, `kysely`, `playwright-core`, `quickjs-wasi`, `node-edge-tts`, `typescript`, `zod`, `yaml`, `chokidar`, and many utility packages.
- It is substantially heavier than Korvin and requires a newer Node runtime.

Implementation summary:

- The gateway starts from `src/gateway/server.ts` and lazy-loads `src/gateway/server.impl.ts`.
- The gateway hosts HTTP/WebSocket control surfaces, channel plugins, plugin services, model catalog, health, cron, session events, and optional OpenAI-compatible endpoints.
- Agent execution is coordinated in `src/agents/agent-command.ts`, with model/provider selection, fallback, auth profile handling, workspace setup, skill snapshots, transcript persistence, session compaction, and delivery back to channels.
- Multi-agent and subagent support is implemented in `src/agents/subagent-spawn.ts`, including spawn depth limits, active-child limits, agent allow policies, context fork/isolation modes, sandbox compatibility checks, child session records, subagent lifecycle hooks, and timeout handling.
- Security includes gateway auth, auth-attempt rate limiting, DM pairing, channel allowlists, external-content wrapping, transcript redaction, tool allow/deny policy, sandbox configuration, browser origin controls, and gateway exposure runbooks.
- OpenClaw supports far more channels than Korvin: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo, WeChat, QQ, WebChat, and companion node surfaces.

## 3. Feature Matrix

| Feature | Korvin | Hermes Agent | OpenClaw |
|---|---|---|---|
| Memory / conversation persistence | Yes. SQLite chat history via `data/memory.db`; recent bounded history in gateway; dashboard memory controls. | Yes. SQLite/session persistence, memory providers, user/profile memory, FTS-style session recall per README, context compression. | Yes. Session transcripts, session store, workspace files, compaction, session history APIs; not as memory-centric as Hermes. |
| Skill/tool routing | Fixed regex dispatcher with 5 skills: research, schedule, document draft, security report, inbox stub. | Model-callable tools and procedural skills; skill creation/improvement loop; Skills Hub integration. | Tool/skill/plugin system with runtime skill snapshots, bundled/workspace skills, plugin SDK, channel tools. |
| Multi-agent / sub-agent support | No. Single gateway plus fixed skills. | Yes. `delegate_task` and isolated subagents for parallel workstreams. | Yes. Multi-agent routing and `sessions_spawn` with depth/child limits and isolated/forked context. |
| Model agnosticism | Yes through LiteLLM; currently configured for DeepSeek and Gemini, with active model file. | Yes. Supports many OpenAI-compatible and native providers; model switching via CLI/gateway. | Yes. Supports multiple providers and auth profiles including OpenAI, Anthropic, Gemini, Mistral, local providers, and model fallback. |
| Rate limiting | Yes. Per-user/session in-memory sliding window: 20 requests / 60 seconds. | Partial. Provider rate-limit header tracking and quota/fallback logic; not primarily an inbound per-user limiter. | Partial/yes. In-memory auth-attempt rate limiter with lockout; channel throttling dependencies; not identical to Korvin's chat request limiter. |
| Prompt injection defense | Yes. Input sanitizer, defender patterns, system prompt warning about untrusted external content. | Partial/yes. Memory context fencing, command security scanner, tool guardrails, secret redaction; less focused on simple front-door pattern blocking. | Yes. External content wrapper with randomized untrusted-content markers, special token sanitization, security docs, tool policy, sandboxing. |
| Input sanitization | Yes. 2000-char cap, prompt injection patterns, shell/operator/path/XSS checks. | Yes. Unicode/surrogate cleanup, tool-call JSON repair, command scanning, path/URL safety helpers. | Yes. Chat envelope stripping, external content sanitization, special token removal, config/input normalization. |
| Output redaction | Yes. Secret-looking strings redacted in gateway/dashboard paths. | Yes. Broad secret redaction for logs/tool output with many vendor token patterns. | Yes. Transcript/log redaction with configurable sensitive-field patterns. |
| Dashboard / web UI | Yes. FastAPI dashboard plus optional Open WebUI in Docker. | Yes, via optional `web` extra and dashboard docs; CLI/TUI is primary. | Yes. Browser Control UI and companion apps/nodes. |
| Telegram integration | Yes. Core channel. | Yes. Messaging gateway supports Telegram. | Yes. One of many supported channels. |
| Voice input | Partial. Dashboard has Whisper STT endpoint and heavy voice deps, but no wake-word client. | Yes/partial. Voice memo transcription, STT/TTS extras, voice mode tooling. | Yes. Voice Wake/Talk Mode, iOS/Android/macOS nodes, TTS fallback. |
| Docker / self-hosted install | Yes. `install.sh` for Ubuntu and `docker-compose.yml`; Docker path not fully triple-tested yet. | Yes. Installer and docs describe VPS/serverless/Docker-style backends; repo has Dockerfile/compose. | Yes. npm install, daemon, Docker compose, Nix, platform runbooks. |
| License | MIT. | MIT. | MIT. |
| Node.js footprint | Small Node app: 3 runtime npm deps in `package.json`; Node 18 target. | Mostly Python, but installer also brings Node for tooling/gateway pieces. | Heavy Node app: Node >=22.19; npm package unpacked about 81 MB; many runtime deps. |
| Python footprint | FastAPI dashboard plus current `requirements.txt` is heavy because it includes Whisper, Torch, CUDA/NVIDIA packages, spaCy, Kokoro/TTS, Transformers. | Core wheel about 11 MB, but optional extras can become heavy. Python >=3.11. | Primarily TypeScript/Node; no Python runtime requirement for core. |
| Install size | Small Node side, but Python requirements can be very large if installed wholesale. | Medium base, heavy if all extras are installed. GitHub repo about 277 MB. | Heavy. npm unpacked about 81 MB; repo about 1.46 GB; source setup is large. |

## 4. What They Have That Korvin Doesn't

### Procedural skill lifecycle

Hermes can create, manage, and improve skills from experience. OpenClaw has workspace skills and plugin-backed skill/runtime snapshots. Korvin currently has five hand-coded regex skills.

Why it matters: Korvin's skill set is easy to audit, but every new capability requires code changes. A constrained local skill format could let the operator add repeatable workflows without editing core source files.

### Subagents / parallel workstreams

Hermes can delegate work to subagents. OpenClaw has a large subagent system with spawn depth limits, active-child limits, separate sessions, model choices, sandbox policy, and lifecycle events. Korvin does not spawn subagents.

Why it matters: Some operator tasks naturally split into research, drafting, verification, and execution. Parallel subagents can speed those tasks, but they also increase cost, complexity, and security risk.

### Broad channel gateway

OpenClaw supports many channels. Hermes supports several major messaging platforms. Korvin supports Telegram and dashboard chat.

Why it matters: More channels make the assistant available where the operator already works. The security cost is real: each inbound channel adds identity, authorization, rate-limit, replay, and prompt-injection surface area.

### External content wrappers

OpenClaw has a strong pattern for wrapping untrusted external content with randomized boundary markers, explicit security warnings, and special-token sanitization. Korvin has a system prompt warning and pattern blocking, but it does not have a reusable `wrapExternalContent()` abstraction for web/email/API content.

Why it matters: This is one of the most practical security upgrades for Korvin. Web pages, emails, and fetched documents are where indirect prompt injection becomes a real operational issue.

### Tool allow/deny policy

OpenClaw has configurable allow/deny tool policy, sandbox-aware defaults, plugin tool groups, and inherited tool restrictions for subagents. Hermes has toolsets, tool guardrails, command approval, and command security scanning. Korvin avoids most of this by not exposing arbitrary tools.

Why it matters: Korvin can remain safer by keeping tools bounded, but as skills grow it needs a simple permission layer before adding mutating integrations like email, files, or calendar.

### Gateway auth and pairing model

OpenClaw has DM pairing and local allowlists for unknown senders. Korvin relies on Telegram bot access and dashboard API key/Cloudflare Access. There is no generic pairing workflow.

Why it matters: Pairing matters if Korvin expands beyond one Telegram operator or exposes additional channels. It is less urgent while Korvin remains single-operator Telegram plus protected dashboard.

### Session management and compaction

Hermes and OpenClaw both have more developed session lifecycle management, context compression/compaction, session search/history, and resume/branch concepts. Korvin has recent SQLite history and dashboard memory controls, but dashboard chat duplicates gateway logic and memory behavior is simpler.

Why it matters: Better session control improves long-running work and reduces token waste without giving the model more agency.

### Tool loop guardrails

Hermes detects repeated tool failures and repeated no-progress calls, then warns or halts depending on config. OpenClaw also has extensive tool policy and execution controls. Korvin has no autonomous tool loop, so this is not a current gap until it adds model-callable tools.

Why it matters: The feature becomes important only if Korvin moves beyond fixed skills into model-selected tools.

### Native voice/wake surfaces

OpenClaw has voice wake and mobile/macOS nodes. Hermes has voice memo transcription and STT/TTS tooling. Korvin has a dashboard STT endpoint and heavy voice packages, but no full wake-word client or mobile node.

Why it matters: Voice is valuable for a personal assistant, but always-on voice introduces privacy, CPU/RAM, and deployment complexity.

### Plugin ecosystem

OpenClaw has plugin packages, channel plugins, provider catalogs, and SDK packages. Hermes has optional skills, MCP, and provider/tool extras. Korvin has local modules only.

Why it matters: Plugins speed expansion. They also increase supply-chain risk and make a small VPS install harder to reason about.

## 5. What Could Be Added to Korvin (Prioritized)

| Priority | Feature | Effort | Security risk | Weight impact | Recommendation |
|---|---|---:|---:|---|---|
| 1 | Reusable external-content wrapper | Low | Low | Lightweight | YES |
| 2 | Unified JS gateway for dashboard + Telegram | Medium | Low | Lightweight | YES |
| 3 | Cleaner source-preserving research output | Low/medium | Low | Lightweight | YES |
| 4 | Local skill manifest format | Medium | Medium | Lightweight if strict | YES |
| 5 | Tool permission policy for future skills | Medium | Low/medium | Lightweight | YES |
| 6 | Session controls: `/new`, `/reset`, `/summarize`, named sessions | Medium | Low | Lightweight | YES |
| 7 | Persistent rate-limit state or SQLite-backed limiter | Low/medium | Low | Lightweight | YES |
| 8 | Docker path hardening and clean-state test | Medium | Low | Lightweight operational work | YES |
| 9 | Optionalize heavy voice/TTS Python deps | Medium | Low | Major weight reduction | YES |
| 10 | Email integration with OAuth and read-only first pass | Medium/high | Medium/high | Moderate | MAYBE |
| 11 | Wake-word voice client | High | Medium/high | Heavy | MAYBE |
| 12 | Subagents | High | High | Moderate/heavy | MAYBE later |
| 13 | Multi-channel gateway beyond Telegram | High | Medium/high | Heavy over time | MAYBE, one channel at a time |
| 14 | Full plugin marketplace | High | High | Heavy | NO for now |
| 15 | Arbitrary shell/tool execution by model | Medium | High | Moderate | NO |
| 16 | OpenClaw-scale gateway/control plane | Very high | High | Heavy | NO |

### 1. Reusable external-content wrapper

What it does: Wrap web pages, search results, emails, and API responses in explicit untrusted-content markers before passing them to the model. Strip or replace model special tokens and marker spoofing attempts.

Why add it: High security return for low complexity. It fits Korvin's existing defender posture and directly strengthens the research and future inbox/RAG paths.

Recommendation: YES. Implement as a small local module, not a framework import.

### 2. Unified JS gateway for dashboard + Telegram

What it does: Make dashboard chat call the same `sendMessage()` gateway path as Telegram instead of duplicating rate-limit, skill, memory, redaction, and LiteLLM logic in Python.

Why add it: Reduces drift. Today the dashboard path mirrors the JS gateway but does not import it directly.

Recommendation: YES. Keep FastAPI as the dashboard shell if useful, but centralize agent behavior.

### 3. Cleaner source-preserving research output

What it does: Preserve raw URLs/titles/snippets from the research helper and feed the LLM a structured source block. Return citations and uncertainty more reliably.

Why add it: Korvin already has web research. This improves trust without adding much weight.

Recommendation: YES.

### 4. Local skill manifest format

What it does: Define a local folder format like `skills/<name>/skill.json` plus a JS handler or safe command binding. Keep skills explicit, operator-installed, and disabled by default unless allowlisted.

Why add it: Captures the useful part of Hermes/OpenClaw skill ecosystems without adding a plugin marketplace.

Security requirement: No arbitrary shell by default. No network access unless explicitly declared. Inputs and outputs go through sanitizer/redactor.

Recommendation: YES, with strict allowlisting.

### 5. Tool permission policy

What it does: Add a simple allow/deny policy per skill category: read-only, network-read, local-status, external-write, local-write.

Why add it: Korvin can safely add calendar, email, files, and webhooks only if capabilities are classified before execution.

Recommendation: YES.

### 6. Session controls and compaction

What it does: Add `/new`, `/reset`, named session IDs, and a summarize-old-history option.

Why add it: Helps long-running operator workflows while keeping memory bounded and cheap.

Recommendation: YES. Start with explicit commands, not automatic memory rewriting.

### 7. SQLite-backed rate limiter

What it does: Store limiter timestamps or counters in SQLite so restarts do not reset limits.

Why add it: Small hardening improvement. In-memory is acceptable for v1.0, but persistent limits are more robust.

Recommendation: YES after core feature work.

### 8. Docker path hardening and clean-state test

What it does: Make Docker install a first-class tested path, with loopback-only exposed ports and secret handling verified.

Why add it: Korvin already has Docker compose. Testing it makes the deployment story stronger.

Recommendation: YES.

### 9. Optionalize heavy voice/TTS Python dependencies

What it does: Split `requirements.txt` into base dashboard requirements and optional voice/TTS requirements.

Why add it: This is the biggest lightweight win. Current requirements include Torch, CUDA/NVIDIA packages, Whisper, Transformers, spaCy, and Kokoro/TTS packages. That does not match a 1 GB VPS target if installed wholesale.

Recommendation: YES.

### 10. Email integration

What it does: Implement Gmail or Outlook OAuth, read-only inbox summary, and explicit send confirmation later.

Why add it: The inbox skill is already a recognized stub and is a natural operator workflow.

Security requirement: Start read-only. Wrap email bodies as untrusted external content. Never auto-send without explicit confirmation.

Recommendation: MAYBE, but valuable for v1.1 if done carefully.

### 11. Wake-word voice client

What it does: Always-on or push-to-talk voice capture that sends text to Korvin.

Why add it: Useful personal-agent interface.

Risk: Privacy and resource use. Always-on audio should be an optional local device client, not mandatory VPS work.

Recommendation: MAYBE.

### 12. Subagents

What it does: Spawn isolated helper agents for parallel research/drafting/verification.

Why add it: Powerful for complex tasks.

Risk: More model calls, more state, harder debugging, more security controls needed.

Recommendation: MAYBE later. Add only after skill permissions, session controls, and external-content wrappers are solid.

### 13. Multi-channel gateway

What it does: Add Discord, Slack, Signal, WhatsApp, or other channels.

Why add it: More surfaces for the operator.

Risk: Identity and abuse surface increases with every channel.

Recommendation: MAYBE one at a time. Do not copy OpenClaw's broad channel matrix.

### 14. Full plugin marketplace

What it does: Remote plugin discovery, installation, update, and execution.

Why not now: Too much supply-chain and operational complexity for Korvin's current target.

Recommendation: NO for now. Local operator-installed skills are enough.

### 15. Arbitrary shell/tool execution by model

What it does: Let the model run commands or mutate files directly.

Why not now: This would weaken Korvin's strongest current property: bounded agency.

Recommendation: NO. Keep security report commands fixed. If command tools are ever added, require explicit operator approval and sandboxing.

### 16. OpenClaw-scale gateway/control plane

What it does: Rebuild Korvin into a full multi-channel, plugin, node, app, sandbox, and control-plane platform.

Why not now: It conflicts with the small VPS, lightweight, easy-audit goal.

Recommendation: NO. Borrow specific patterns, not the whole architecture.

## 6. Summary

Korvin does well because it is bounded and understandable. The current gateway has persistent SQLite memory, LiteLLM model routing, a protected dashboard, Telegram access, redaction, prompt-injection blocking, rate limiting, token tracking, and five clear skills. Compared to Hermes and OpenClaw, Korvin is much easier to audit and much safer by default because it does not give the model arbitrary tools or a broad multi-channel attack surface.

The next best additions are security and leverage features that stay small: reusable external-content wrapping, one shared gateway path for dashboard and Telegram, better research citations, local skill manifests, a simple tool permission model, session controls, persistent rate limits, Docker clean-state validation, and splitting heavy voice dependencies out of the base install. These build real capability without breaking the LiteLLM model-agnostic design.

Korvin should deliberately avoid copying the heavy parts of Hermes and OpenClaw right now: broad plugin marketplaces, arbitrary shell execution, OpenClaw-scale channel support, and always-on multi-agent orchestration. Those are powerful, but they add weight and risk. The practical path is to keep Korvin small, secure, self-hostable, and operator-controlled while adding carefully chosen capabilities one layer at a time.
