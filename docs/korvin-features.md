# Korvin — Feature Reference

Korvin is a self-hosted personal AI agent. Low-cost VPS (2 vCPU, 8 GB RAM). No cloud subscriptions.

---

## Core Stack

| Component | What it is |
|-----------|-----------|
| Telegram bot | Primary interface — text and voice |
| FastAPI dashboard | Web UI + REST API (port 3002) |
| LiteLLM proxy | Model router (port 4000) — DeepSeek, Gemini, and others |
| SQLite | Ordered conversation memory |
| Faster-Whisper tiny.en | Local speech-to-text, no API cost — 4-8x faster, int8 quantized |
| Kokoro TTS | Local text-to-speech (no external API) |

---

## Skills (Telegram commands)

---

### 🔍 Web Research
**Trigger:** `research <topic>` or `/scan url <url>`  
**What it does:** Searches DuckDuckGo, fetches real page content when `KORVIN_ADVANCED_SCRAPER=1` is set (robots.txt-compliant, CSS-targeted extraction), then synthesizes a structured report — Summary, Key Findings, Sources, Uncertainty. Without the flag it uses search snippets only. Raw results are passed through the research compressor (HTML strip, whitespace collapse, 8 000-character cap) before reaching the LLM, keeping token usage predictable.

**Creative uses:**
- `research DeepSeek R2 vs GPT-5 benchmarks` → Korvin reads actual benchmark pages and papers, not just headlines. You get a sourced comparison, not search results.
- `research what changed in Node.js 22 from 20` → reads the official changelog and community blog posts, synthesizes just the breaking changes and new APIs.
- `/scan url https://somecompany.com/pricing` → paste any URL and get a clean summary of that specific page — pricing tiers, terms, changelog, whatever is there.
- `research best open-source alternatives to [paid tool]` → Korvin reads review sites and GitHub READMEs, returns a ranked list with real reasons, not ads.
- `research [person's name] recent talks or interviews` → pull together what someone has said publicly this year without manually opening 10 tabs.
- `research [your industry] regulations update 2026` → Korvin reads government and trade sites directly. Good for compliance due diligence.
- `research how to set up [technology] on Ubuntu 24` → reads actual tutorials from trusted sources, returns step-by-step instructions you can follow directly in Telegram.
- Chain with document-drafter: `research X` → then `write a report about [paste Korvin's findings]` → finished deliverable in two messages.
- Set up with task-automator: `every weekly do research latest AI model releases` → weekly AI digest lands in Telegram every Monday morning without you lifting a finger.

---

### 📺 YouTube Transcription
**Trigger:** `/youtube <url>` or paste a bare YouTube URL  
**What it does:** Downloads only the audio track via yt-dlp (not the video — much smaller), transcribes it locally with Whisper on your VPS. No third-party API. No cost per minute. Returns the full transcript as text in Telegram. Cleans up the temp audio file immediately after.

**Creative uses:**
- Send a conference talk URL and follow up with "summarize the key points" — Korvin transcribes it locally, then the LLM reads the full transcript and gives you a structured summary with timestamps of what matters.
- "What exact quote did [speaker] say about [topic] in this video?" → transcribe → ask Korvin to search the transcript for that moment. You get the verbatim quote, not a paraphrase.
- Transcribe a podcast episode about your industry → ask "what were the three most actionable ideas?" → save that to memory so you can recall it months later with "what did I note from that podcast about X?"
- Use it as a private offline caption generator for YouTube videos that have bad or missing auto-captions — especially useful for older content or niche channels.
- Transcribe a product demo video from a competitor → ask Korvin "what features did they announce?" → you have a written record with zero manual note-taking.
- Language learners: paste a YouTube video in the language you're learning → get the full text → ask Korvin to translate it and explain vocabulary or grammar patterns.
- Transcribe cooking or tutorial videos → ask "list just the ingredients and quantities" or "give me the steps in numbered format" → paste into your notes app.
- Transcribe a long interview → ask "what did they say about [specific topic]?" → Korvin searches the transcript for just that section. Saves you watching 90 minutes to find a 3-minute answer.
- Transcribe educational lectures → save multiple lectures on the same topic → later ask "across everything I've sent you about machine learning, what's the core concept I keep seeing?" → ChromaDB semantic memory surfaces connections.
- Transcribe your own recordings: upload a voice memo to YouTube (unlisted) → transcribe → get clean text for notes, journal entries, or meeting records.

---

### 📝 Document Drafter
**Status:** Planned — not yet implemented. Listed here as a design target.  
**Trigger (planned):** `write a <type> about <topic>`  
**What it will do:** Use the active LLM to produce a complete, polished document with placeholders like `[Name]`, `[Date]`, `[Company]` where specifics are unknown. Returns a formatted draft directly in Telegram.

**Creative uses:**
- `write a project proposal about building a client portal for a law firm` → complete proposal with problem statement, solution, timeline, budget section, and next steps. Edit the placeholders and it's ready to send.
- `write an email about a project delay to a client` → professional, empathetic email explaining the delay, what caused it, and the revised timeline. Edit `[Name]` and `[new date]` and send.
- `write a job posting about a senior backend engineer who knows Go and Postgres` → full job description with responsibilities, requirements, nice-to-haves, and compensation placeholder.
- `write a terms of service about a SaaS app that processes personal data` → starting framework you can give to a lawyer to refine. Saves hours of "where do I even start?"
- `write a technical spec about implementing webhook retry logic` → architecture doc with retry strategy, backoff formula, failure handling, and monitoring recommendations.
- `write a performance review about an engineer who shipped three features and missed one deadline` → balanced, professional draft with specific language you can adapt for HR.
- `write a cold email about partnering with indie hackers who use Telegram bots` → compelling, specific cold outreach. Personalize the `[Name]` and send.
- `write a checklist about deploying a Node.js service to a VPS` → operational runbook. Good for teams where you want consistent deploy procedures.
- `write a privacy policy about a personal AI assistant that stores conversation history` → usable starting draft for a product like Korvin itself.
- Chain with research: `research [topic]` → `write a report about [findings Korvin gave you]` — two messages and you have a sourced, structured deliverable.

---

### ⚙️ Task Automator (Scheduler)
**Status:** Live  
**Trigger:** `every <daily|hourly|weekly|Monday> do <action>` / `remind me to <action> every <schedule>`  
**What it does:** Saves recurring tasks to `data/cron_jobs.json`. At the scheduled time, Korvin runs the action and sends the result to Telegram. A noise filter silently drops trivial results (under 15 characters, empty responses, apology patterns) so only meaningful output reaches you.

**Creative uses:**
- `every daily do security report` → Korvin texts you disk usage, RAM, and service status every morning before you start work. You know if something crashed overnight without logging in.
- `every weekly do research latest AI model releases` → Monday morning Korvin sends you a synthesized AI news digest. No newsletters, no RSS feeds, no Twitter.
- `remind me to review my cron jobs every Monday` → meta-habit: Korvin reminds you to audit what Korvin is doing.
- `every daily do check vps` → a second daily check at a different time for redundancy, useful if you want morning and evening status.
- `every weekly do write a summary about what I worked on this week` → at the end of the week Korvin prompts you — you paste in your notes and it drafts your weekly status update.
- `every daily do research [your niche] news` → Korvin researches your industry every morning and sends you a briefing. Like a personal analyst on $5/month.
- Combine with the security monitor: schedule `check services` hourly during a critical deployment window. Cancel when the deploy is stable.
- Build a habit: `remind me to do 10 minutes of reading every daily` → Korvin pings you at 9am. Simpler than a habit app, lives in your Telegram.

---

### 🛡️ Security / VPS Monitor
**Trigger:** `security report` / `check vps` / `check services`  
**What it does:** Runs live commands on the VPS — `df -h` for disk, `free -m` for RAM, `systemctl is-active` for all three services. Returns a timestamped snapshot. Also writes your chat ID to `data/security_monitor_chat.txt` so scheduled security reports know where to send results.

**Creative uses:**
- Run `check vps` before any major change (new package install, config edit, service restart) to capture the baseline. Run it again after. Compare.
- `security report` when Korvin feels slow → check if RAM is near limit or a service silently exited.
- Pair with task-automator: `every daily do security report` — you get a morning briefing without SSH-ing into the server.
- Check services right after a VPS reboot to confirm all three services came back up cleanly.
- If you suspect a memory leak, run `check vps` hourly for a day and watch the RAM number climb. When it spikes, you have a timestamp to cross-reference with your logs.
- Add to your pre-deploy routine: `security report` → verify services are healthy → deploy → `security report` again → confirm nothing changed unexpectedly.
- If you share Korvin with family or a small team, use the security monitor to see if the VPS needs an upgrade (RAM near limit = time to scale up).

---

### 🔒 Dependency Scanner
**Trigger:** `/scan deps`  
**What it does:** Reads `package.json` and `requirements.txt` from the Korvin codebase. Lists every Node.js and Python package with its version. Flags anything using `*` (wildcard) or `file:` references as unpinned. Never calls npm, pip, or any package manager — reads files only (zero-execution invariant enforced at runtime).

**Creative uses:**
- `/scan deps` after any `npm install` or `pip install` to see exactly what was added and whether anything is unpinned.
- Use as a pre-deploy safety check: `/scan deps` → review the list → then push to production.
- `/scan deps` then ask Korvin "do any of these packages have known vulnerabilities?" (Korvin can research them with the web-researcher skill).
- Chain with `/patch <package>` for any package that catches your eye: `/scan deps` → notice `nginx` is listed → `/patch nginx` → see if an update is available.
- Build a monthly habit: first Monday of the month, `/scan deps` and note the package count. If it grew unexpectedly, investigate what was added.
- Run `node src/skills/dep-scan.js` directly on the server to also verify the zero-execution invariant passes — useful after any code change to dep-scan itself.

---

### 📦 Package Patch Check
**Trigger:** `/patch <package-name>`  
**What it does:** Queries `apt` on the VPS for pending upgrades for the named package. Returns the upgrade command if an update is available.

**Creative uses:**
- `/patch nginx` / `/patch openssl` / `/patch curl` — the three most common security-critical system packages. Check all three monthly.
- After reading CVE news or a security advisory, immediately run `/patch <affected-package>` to see if your server is exposed.
- Chain after `/scan deps` — spot a package in the list, patch-check it without leaving Telegram.

---

### 📌 Persistent Rules
**Trigger:** `/rule add <preference>` · `/rule list` · `/rule remove <n>` · `/rule clear`  
**What it does:** Saves a preference to SQLite and prepends it to the system prompt on every future message — no editing config files, no restarts. Rules stack: add as many as you want. They stay across sessions, across model switches, and survive a service restart. Remove any one by number, or wipe all at once with `/rule clear`.

**Ways to use it:**
- `/rule add always use bullet points` — Korvin formats every response as a bulleted list without you asking again.
- `/rule add keep answers under 150 words` — forces concise replies when you're reading on your phone and don't want walls of text.
- `/rule add respond in Spanish` — flip Korvin's output language permanently without touching any config.
- `/rule add when I say "brief it" skip the intro and go straight to the key points` — teach Korvin a shortcut phrase that only you know.
- `/rule add always end with a one-line action item` — useful if you use Korvin for daily planning and want a clear next step at the end of every response.
- `/rule list` to review what's active, then `/rule remove 2` to drop a rule that's no longer useful — no restart needed, effective immediately.
- Use `/rule clear` when switching projects: wipe all project-specific rules and add a fresh set for the new context.

---

### 🧠 Memory Management
**Trigger:** `/summarize` · `/search <query>`  
**What it does:** Two commands that let you actively work with your conversation history rather than just reading it.

`/summarize` compresses the current session into a short digest — useful when a conversation has gone deep and you want a clean "where are we" before continuing. The summary is generated by your active LLM and returned inline.

`/search <query>` does a full-text keyword search across your SQLite conversation history and returns the most relevant past messages. This is how you find something you discussed weeks ago without scrolling.

**Ways to use it:**
- Long research session → `/summarize` → paste the summary into a new conversation as context. You keep the conclusions without carrying the full token cost.
- `/search deployment` → surfaces every message where you discussed deploying something. Good for auditing what you've done or finding a command you used once and forgot.
- `/search error` → find past error messages and Korvin's responses to them. If the same issue recurs, you can see what fixed it last time.
- `/summarize` mid-conversation to check Korvin's understanding of what you're building — if the summary is wrong, correct it before going further.
- Before starting a new topic, `/summarize` the current thread and `/save` the session. Clean slate, but the summary is a breadcrumb back to where you were.
- `/search openssl` → track every CVE discussion you've had about a specific package across all past sessions.
- Pair with `/save`: finish a work session with `/summarize`, note the digest in your own notes, then `/save project-name`. When you return with `/load project-name`, the full context is back — use your notes to reorient yourself quickly.

---

### 📅 Daily Digest
**Trigger:** Automatic — fires every night at 23:00 (server time). No user action needed.  
**What it does:** Reads the current chat ID registered by the security monitor. Calls `summarizeSession` with the active LLM to produce a short plain-text summary of the day's conversation. Appends the first 200 characters to `MEMORY.md` under today's date header. Delivers the full digest to Telegram.

**Ways to use it:**
- Wake up to a digest of everything Korvin did or discussed the day before — no log digging.
- The digest entry in `MEMORY.md` creates a searchable journal of daily activity. Run `/search` against it weeks later.
- Pair with `/goal` — the digest reminds you what you worked on; the goal heartbeat reminds you what matters.

---

### 🎯 Goal Heartbeat
**Trigger:** `/goal [text]` sets a goal. Heartbeat fires automatically every 4 hours.  
**What it does:** Saves the goal text and the chat ID. Every 4 hours, sends "Goal check-in: [your goal]" to Telegram. `/goal clear` removes the goal and stops the heartbeat.

**Ways to use it:**
- `/goal ship v1.2.0 today` → Korvin pings you three times during the workday to keep the priority visible.
- Use for habit tracking: `/goal 30 minutes of reading before bed` → the check-in is a nudge, not a nag.
- Combine with the daily digest: the digest shows what you worked on; the goal check-in shows what you intended to work on. Gaps are visible.
- `/goal clear` when you hit the goal — clean slate for the next one.

---

### 📋 Activity Log
**Trigger:** `/log`  
**What it does:** Returns a timestamped list of recent agent activity — what commands ran, what skills fired, and when. The log reads from `data/audit.ndjson`, which records every skill dispatch, LLM response, and security event as a structured JSON line. You see exactly what Korvin has been doing without SSH-ing into the server.

**Ways to use it:**
- `/log` right after a scan or patch check to confirm the action ran and see the timestamp. Good when a command felt like it didn't respond.
- Check `/log` after leaving Korvin idle overnight — if anything fired unexpectedly, you'll see it immediately.
- Pair with `/status`: `/status` tells you the VPS is healthy, `/log` tells you what's been happening on it. Together they give you a complete operational picture.
- `/log` as the last step in your pre-deploy checklist — verify no background activity is running before you push a change.
- If you share Korvin with a small team, `/log` shows who sent commands and when, without exposing message content (audit entries include chat_id and action type, not message text).
- Use after a `/scan system` to confirm the Lynis audit event appears in the log — cross-check that security commands are completing and being recorded.

---

### 📬 Inbox Summarizer
**Status:** Pending — requires OAuth setup with Gmail or Outlook. Placeholder is live; returns a helpful message explaining what's needed. Ships in v1.1.

---

---

## Security Features

### Input Sanitizer
Every message passes through `defender.js` before reaching the LLM. Blocks known prompt injection patterns, strips control characters, enforces length limits.

### YAML Rule Engine
**File:** `data/security_rules.yaml`  
Edit this file to add or change blocked/suspicious patterns — no code deploy needed. Restart korvin.service to reload.

Current blocks: 13 prompt-injection phrases (e.g. "ignore all previous instructions")  
Current suspicious: 5 role-delimiter probes (e.g. "system:", "assistant:")

### NDJSON Audit Log
**File:** `data/audit.ndjson`  
Every security event is appended as one JSON line: `input_blocked`, `injection_blocked`, `skill_dispatched`, `llm_response`. Includes timestamp and chat_id. Never logs message content.

```bash
# Quick audit queries
grep injection_blocked data/audit.ndjson | wc -l   # total injection attempts
grep llm_response data/audit.ndjson | python3 -c "import sys,json; [print(json.loads(l).get('tokens',0)) for l in sys.stdin]"  # token usage
```

### Zero-Execution dep-scan
`dep-scan.js` enforces a self-verified invariant: it reads manifests but never shells out. Run `node src/skills/dep-scan.js` to verify. Use as a CI check.

---

## Voice Pipeline

```
Microphone → VAD check → Whisper STT → LLM → Kokoro TTS → Audio reply
```

**VAD (Voice Activity Detection):** Silent audio (< -40 dBFS) is rejected before Whisper loads. Saves CPU, prevents hallucination on silence.

**STT:** Faster-Whisper tiny.en running locally (int8 quantized — ~95 MB RAM, 4-8x faster than stock Whisper, identical accuracy). Model: configurable via `KORVIN_STT_MODEL`. Upgrade path: set `KORVIN_STT_MODEL=distil-large-v3` to use Distil-Whisper's architecture inside Faster-Whisper's engine — no code change required.

**TTS:** Kokoro — runs locally, no API cost, no external service required.

---

## Memory

**Default:** SQLite at `data/memory.db`. Ordered conversation history per chat_id.

**Strategies** (set in `config.json`):
- `sliding_window` — keep last N messages (default)
- `summarize` — compress old messages via LLM before pruning
- `hard_stop` — refuse to save once limit reached

**Optional: ChromaDB vector memory**  
Set `KORVIN_MEMORY_BACKEND=chromadb` + `pip install chromadb`.  
Enables `search_similar(chat_id, query, k=5)` — semantic search by meaning, not keyword. Data stored in `data/chroma/`.

---

## Credential Vault (opt-in)

**File:** `src/vault/vault.js`  
A loopback-only HTTP server (default port 4001) that brokers secrets to other Korvin processes. Configure with `KORVIN_VAULT_HOST`, `KORVIN_VAULT_PORT`, `KORVIN_VAULT_TOKEN`.

Gateway fetches the LiteLLM key lazily from the vault on first request when `KORVIN_VAULT_URL` + `KORVIN_VAULT_TOKEN` are set.

Allowlisted keys: `LITELLM_MASTER_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`.

---

## Dashboard Authentication

Two-layer auth on protected endpoints:
1. `X-Korvin-Key` header — main API key (`KORVIN_API_KEY`)
2. `X-Korvin-Token` header — dashboard token (`KORVIN_DASHBOARD_TOKEN`, optional)

`/api/health` reports `dashboard_token_required: true/false` so clients can detect which layers are active.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KORVIN_API_KEY` | — | Dashboard auth key |
| `KORVIN_DASHBOARD_TOKEN` | (off) | Second auth factor for dashboard |
| `LITELLM_MASTER_KEY` | — | LLM proxy auth |
| `KORVIN_STT_MODEL` | `tiny.en` | Faster-Whisper model size (also accepts `distil-large-v3` for upgrade) |
| `KORVIN_ADVANCED_SCRAPER` | (off) | Enable CSS-targeted web scraping |
| `KORVIN_MEMORY_BACKEND` | `sqlite` | Set to `chromadb` for vector memory |
| `KORVIN_VAULT_URL` | (off) | Vault server URL |
| `KORVIN_VAULT_TOKEN` | — | Vault auth token |
| `KORVIN_VAULT_HOST` | `127.0.0.1` | Vault bind address |
| `KORVIN_VAULT_PORT` | `4001` | Vault port |

---

## Systemd Services

| Service | What runs |
|---------|-----------|
| `korvin.service` | Node.js Telegram bot |
| `korvin-dashboard.service` | FastAPI dashboard (port 3002) |
| `litellm.service` | LiteLLM proxy (port 4000) |

Restart: `sudo -n /usr/bin/systemctl restart korvin.service`

---

## File Layout

```
korvin/
├── data/
│   ├── memory.db          # SQLite conversation memory
│   ├── audit.ndjson       # Security event log
│   ├── cron_jobs.json     # Scheduled tasks
│   ├── tts_provider.txt   # Active TTS selection (set by dashboard)
│   ├── active_model.txt   # Active LLM model
│   ├── security_rules.yaml→  # Prompt injection rules (edit directly)
│   └── chroma/            # ChromaDB vector store (if enabled)
├── src/
│   ├── dashboard/         # FastAPI app + static HTML
│   ├── openclaw/          # Gateway, defender, security
│   ├── hermes/            # Memory layer
│   ├── skills/            # Dispatcher + individual skills
│   ├── vault/             # Credential vault sidecar
│   └── security/          # External content wrapper
└── config.json            # Memory strategy, model config
```
