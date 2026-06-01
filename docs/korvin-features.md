# Korvin — Feature Reference

Korvin is a self-hosted personal AI agent. $5/month VPS. No cloud subscriptions.

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
**What it does:** Searches DuckDuckGo, fetches real page content when `KORVIN_ADVANCED_SCRAPER=1` is set (robots.txt-compliant, CSS-targeted extraction), then synthesizes a structured report — Summary, Key Findings, Sources, Uncertainty. Without the flag it uses search snippets only.

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
**Trigger:** `write a <type> about <topic>`  
**What it does:** Uses the active LLM (DeepSeek, Gemini, or whatever model is selected) to produce a complete, polished document. Uses placeholders like `[Name]`, `[Date]`, `[Company]` where specifics are unknown. Returns a formatted draft directly in Telegram.

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
**Trigger:** `every <daily|hourly|weekly|Monday> do <action>` / `remind me to <action> every <schedule>`  
**What it does:** Saves a recurring task to `data/cron_jobs.json`. At the scheduled time, Korvin sends you the result of that action in Telegram. Cancel any job with `/cancel <job-id>` (Korvin returns the ID when scheduling). Supported schedules: `daily` (9am), `hourly`, `weekly` (Monday 9am), `Monday`.

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
