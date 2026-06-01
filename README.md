# KORVIN

**Self-hosted AI agent. Voice-first. Memory-persistent. Model-agnostic.**

[korvin.cloud](https://korvin.cloud) · [Dashboard demo](https://dashboard.korvin.cloud) · [MIT License](LICENSE.md) · [Security](SECURITY.md)

---

KORVIN is an open-source personal AI agent you install on your own server. It runs on a low-cost VPS (2 vCPU, 8 GB RAM is enough for the full stack including voice), or directly on your Windows or Linux machine. It listens and responds by voice through Telegram, remembers every conversation in a local SQLite database, and routes all LLM calls through LiteLLM so you can swap models in one tap — no restart, no config edit.

Your data stays on your machine. Your keys stay in your env file. If the agent misbehaves you flip a killswitch from the dashboard and it stops accepting messages immediately.

---

## What's running today

| Feature | Status |
|---|---|
| Telegram bot — text and voice messages | ✅ Live |
| Voice pipeline — Whisper STT + Kokoro TTS | ✅ Live |
| Persistent memory — SQLite + 3 overflow strategies | ✅ Live |
| Named sessions — `/save` and `/load` | ✅ Live |
| Web research skill | ✅ Live |
| Security scan — VirusTotal, Lynis | ✅ Live |
| CVE patch research | ✅ Live |
| Confirmation gate — HIGH-risk commands require `/confirm` | ✅ Live |
| FastAPI dashboard — chat, memory, model switcher, logs | ✅ Live |
| Model switcher — swap models from dashboard, no restart | ✅ Live |
| Killswitch — pause agent from dashboard | ✅ Live |
| Token usage tracking | ✅ Live |
| LiteLLM proxy — model-agnostic routing | ✅ Live |
| Cloudflare Tunnel + Access — secure remote dashboard | ✅ Live |

---

## Example interactions

**Security scan with confirmation gate:**

```text
You:    /scan 185.220.101.47
KORVIN: 🔐 Confirmation Required
        Action: scan  Risk: HIGH
        Reply /confirm a1b2c3d4 to execute.

You:    /confirm a1b2c3d4
KORVIN: 🔍 Scanning 185.220.101.47...

        🔴 VirusTotal — 185.220.101.47
        Type: IP
        • Malicious:  14/92 engines
        • Suspicious:  3/92 engines
        • Last seen: 2026-05-29
        ⚠️ Flagged. Do not connect.
```

**Voice message flow:**

```text
[You send a Telegram voice message]
KORVIN: (transcribes with Whisper tiny.en in ~2s)
        (responds as text + sends Kokoro TTS audio reply)
```

**Named session save and restore:**

```text
You:    /save project-alpha
KORVIN: Session "project-alpha" saved — 24 messages.

[later, in a fresh conversation]

You:    /load project-alpha
KORVIN: Loaded session "project-alpha" — 24 messages restored.
```

**VPS health check:**

```text
You:    /status
KORVIN: 🟢 KORVIN — online
        CPU:    12% (2 cores)
        RAM:    1.4 GB / 8 GB used
        Disk:   18 GB / 100 GB used
        Uptime: 14 days, 6 hours
```

**Daily brief:**

```text
You:    /brief
KORVIN: Morning brief — 2026-05-31

        • 3 messages since yesterday
        • Active model: deepseek-v4-pro
        • Memory: 31/46 messages (67%)
        • Last scan: 2026-05-29 — 0 threats
        • Lynis score: 72/100 (last audit: 2026-05-25)
```

---

## Install

KORVIN runs on Linux (VPS or local) and Windows 10/11. Requirements: Node.js 20+, Python 3.10+, Git.

### Linux / VPS

```bash
# Clone into the standard path.
# Several internal paths default to /home/korvin/korvin.
# Clone here or update paths in gateway.js, telegram-bot.js, and src/dashboard/main.py.
git clone https://github.com/nosistech/korvin.git /home/korvin/korvin
cd /home/korvin/korvin

# Node dependencies
npm install

# Python virtual environment (dashboard + voice)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure
cp config.example.json config.json
nano config.json
```

Start manually:

```bash
node src/openclaw/telegram-bot.js          # bot
uvicorn src.dashboard.main:app --host 127.0.0.1 --port 3002   # dashboard
```

For systemd service units and Cloudflare Tunnel setup, see [`docs/deployment.md`](docs/deployment.md).

### Windows 10 / 11

```powershell
# Prerequisites — install these first if missing:
# Node.js 20+  → https://nodejs.org
# Python 3.10+ → https://www.python.org/downloads
# Git           → https://git-scm.com

git clone https://github.com/nosistech/korvin.git C:\korvin
cd C:\korvin

# Node dependencies
npm install

# Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Configure
copy config.example.json config.json
notepad config.json
```

Start manually (two PowerShell windows):

```powershell
# Window 1 — bot
node src/openclaw/telegram-bot.js

# Window 2 — dashboard
uvicorn src.dashboard.main:app --host 127.0.0.1 --port 3002
```

Dashboard opens at `http://127.0.0.1:3002`.

> **Windows path note:** The default internal path is `/home/korvin/korvin`. If you clone to `C:\korvin`, update the `WorkingDirectory` references in `src/openclaw/gateway.js` and `src/dashboard/main.py` to match your clone path.

For the full Windows setup guide including LiteLLM, voice, and running as a background service, see [`quickstart-desktop.md`](quickstart-desktop.md).

### Minimum `config.json`

```json
{
  "telegramToken": "YOUR_TELEGRAM_BOT_TOKEN",
  "memory_limit": 46,
  "max_tokens": 128000,
  "memory_strategy": "sliding_window",
  "summarizer_url": "http://localhost:4000/v1/chat/completions",
  "summarizer_model": "YOUR_MODEL_NAME",
  "litellm_master_key": "YOUR_LITELLM_MASTER_KEY"
}
```

For Docker, see [`docker-compose.yml`](docker-compose.yml).  
For the full Linux guided setup, see [`quickstart.md`](quickstart.md).

---

## Environment file

All secrets live in `/etc/korvin.env` — chmod 600, owned by root, never committed to git.

```bash
# /etc/korvin.env
KORVIN_API_KEY=your_dashboard_key
VIRUSTOTAL_API_KEY=your_virustotal_key
LITELLM_MASTER_KEY=your_litellm_master_key
```

The systemd service units load this file via `EnvironmentFile=/etc/korvin.env`. The bot and dashboard read secrets from environment variables, never from config files.

---

## Architecture

```
Telegram ──────────────────────────────────────────────────────────────┐
                                                                        │
  Voice message                        Text message                     │
       │                                    │                           │
       ▼                                    ▼                           │
  Faster-Whisper                    Sanitizer + Rate limiter            │
  (STT, ~2s)                               │                           │
       │                                    │                           │
       └────────────────┬──────────────────┘                           │
                        ▼                                               │
               OpenClaw Gateway                                         │
               (gateway.js)                                             │
                        │                                               │
          ┌─────────────┴──────────────┐                               │
          │                            │                                │
     Skill router               LiteLLM proxy                          │
     (6 skills)                 (port 4000)                             │
          │                            │                                │
          │                     Any LLM provider                        │
          │                  (DeepSeek / GPT / Claude                   │
          │                   / Llama / Mistral / ...)                  │
          │                                                             │
          ▼                                                             │
   Hermes Memory                                                        │
   (SQLite + strategy)                                                  │
          │                                                             │
          ▼                                                             │
   Kokoro TTS (optional voice reply) ──────────────────────────────────┘

FastAPI Dashboard (port 3002, loopback only)
  ├── Chat panel
  ├── Memory browser
  ├── Model switcher → writes active_model.txt → gateway reads on next message
  ├── Token usage
  ├── Killswitch
  └── Logs

Cloudflare Tunnel + Access → secure remote browser access, no open ports
```

---

## Voice pipeline

KORVIN transcribes Telegram voice messages with **Faster-Whisper** and replies with **Kokoro TTS** audio. Both run locally — no external API, no per-minute cost.

| Model | Size | Speed | Best for |
|---|---|---|---|
| `tiny.en` (default) | 74 MB | ~2s | Voice commands, fast replies |
| `base` | 145 MB | ~8s | Longer dictation |
| `small` | 466 MB | ~20s | Highest accuracy |

`tiny.en` is the default because most KORVIN interactions are short commands and it works on a $5 VPS without a GPU. The model stays loaded between messages so there's no cold-start delay after the first transcription.

Kokoro TTS uses the `bm_lewis` voice by default. It runs entirely on your server — no API calls, no usage limits.

---

## Memory

Every conversation is stored in SQLite. Three strategies control what happens when the message count hits `memory_limit`:

**`sliding_window` (default)** — oldest messages drop as new ones arrive. The agent never pauses.

**`summarize`** — when the limit is hit, KORVIN summarizes the oldest half with your configured LLM, stores the summary as a single message, and deletes the originals. You keep the meaning without the token cost. Falls back to sliding window if summarization fails.

**`hard_stop`** — new messages are rejected until you clear memory manually. Use only if you want full manual control.

```json
{
  "memory_limit": 46,
  "memory_strategy": "sliding_window",
  "summarizer_url": "http://localhost:4000/v1/chat/completions",
  "summarizer_model": "your-model-name"
}
```

---

## Telegram commands

| Command | Risk | Description |
|---|---|---|
| `/scan <url\|ip\|hash>` | HIGH | VirusTotal lookup across 90+ engines |
| `/scan system` | HIGH | Latest Lynis security audit |
| `/patch <package>` | HIGH | CVE research, severity scores, patch recommendations |
| `/confirm <hash>` | — | Approve a pending HIGH-risk action |
| `/cancel <hash>` | — | Cancel a pending HIGH-risk action |
| `/pending` | — | List active pending confirmations |
| `/status` | — | CPU, RAM, disk, uptime |
| `/log` | — | Recent agent activity |
| `/brief` | — | Daily briefing summary |
| `/save [name]` | — | Save current session by name |
| `/load [name]` | — | Restore a named session |
| `/grill` | — | Stress-test a claim or argument |
| `Research <topic>` | — | Web research on any topic |
| `/help` | — | Command menu |

**HIGH-risk gate:** Every HIGH-risk command requires explicit `/confirm <hash>` before executing. Pending actions expire after 5 minutes. The agent cannot bypass this gate — it is enforced in `src/middleware/confirmation-gate.js`, not in the system prompt.

> `/patch` output is AI-generated. Always verify CVE severity and patches against [NVD](https://nvd.nist.gov) or vendor advisories before acting.

---

## Dashboard API

All endpoints at `http://127.0.0.1:3002`. The dashboard is loopback-only — never exposed directly.

**Public — no auth:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/status` | Agent status and version |
| GET | `/api/system` | CPU, RAM, disk |
| GET | `/api/memory/recent` | Recent messages |
| GET | `/api/memory/context-window` | Token and message counts |
| GET | `/api/active-model` | Currently active model |
| GET | `/api/models` | All configured models |
| GET | `/api/killswitch` | Killswitch state |
| GET | `/api/health` | Service health |

**Protected — require `X-Korvin-Key` header:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/logs` | Sanitized system logs |
| POST | `/api/killswitch` | Toggle read-only mode |
| POST | `/api/switch-model` | Switch active model |
| POST | `/api/memory/limit` | Update memory config |
| POST | `/api/memory/prune` | Manually enforce limit |
| POST | `/api/chat` | Send message via dashboard |
| GET | `/api/chat/history` | Dashboard chat history |
| POST | `/api/stt` | Submit audio for transcription |

**Example:**

```bash
# System resources
curl http://127.0.0.1:3002/api/system

# Switch model
curl -X POST http://127.0.0.1:3002/api/switch-model \
  -H "Content-Type: application/json" \
  -H "X-Korvin-Key: YOUR_API_KEY" \
  -d '{"model": "deepseek-v4-pro"}'

# Toggle killswitch
curl -X POST http://127.0.0.1:3002/api/killswitch \
  -H "Content-Type: application/json" \
  -H "X-Korvin-Key: YOUR_API_KEY" \
  -d '{"enabled": true}'
```

---

## LiteLLM

KORVIN routes all LLM calls through [LiteLLM](https://github.com/BerriAI/litellm). Every provider looks identical to the agent. Swap models by updating one file.

`/root/litellm_config.yaml`:

```yaml
model_list:
  - model_name: deepseek-v4-pro
    litellm_params:
      model: openai/deepseek-v4-pro
      api_base: https://api.yourprovider.com/v1
      api_key: YOUR_PROVIDER_API_KEY

general_settings:
  master_key: YOUR_MASTER_KEY
  drop_params: true
```

Always bind to loopback:

```bash
litellm --config /root/litellm_config.yaml --port 4000 --host 127.0.0.1

# Verify
ss -tlnp | grep 4000
# Must show 127.0.0.1:4000, never 0.0.0.0
```

---

## Security model

**What is self-hosted actually protects:**
- Conversations never leave your infrastructure (unless your LLM provider receives them)
- SQLite memory lives on your server in plaintext — disk encryption at the VPS level adds a layer
- API keys stored in `/etc/korvin.env` (chmod 600), never in config files or git

**Architecture constraints:**
- All services bind to `127.0.0.1` only — bot, dashboard, LiteLLM
- Dashboard exposed only through Cloudflare Tunnel + Access (OTP gate)
- Write endpoints require `X-Korvin-Key` header
- Bot and dashboard run as `korvin` system user, not root
- Lynis runs as root via cron, never triggered by the bot directly
- Prompt sanitizer (`src/security/defender.js`) blocks injection patterns before the LLM sees them
- Rate limiter rejects bursts at the gateway layer

**Port audit:**

```bash
ss -tlnp | grep -E "3002|4000"
# All must show 127.0.0.1 — never 0.0.0.0
```

**Never committed to git:**

```
config.json        # Telegram token, LiteLLM master key
data/              # SQLite memory database
logs/              # Runtime logs
*.wav / *.ogg      # Voice recordings
/etc/korvin.env    # All API keys
KORVIN.local.md    # Your personal agent prompt
```

---

## Project structure

```
korvin/
├── src/
│   ├── openclaw/
│   │   ├── gateway.js          # LLM gateway, model routing, session management
│   │   └── telegram-bot.js     # Telegram integration, voice, command dispatch
│   ├── commands/
│   │   ├── scan.js             # VirusTotal + Lynis
│   │   └── patch.js            # CVE research
│   ├── middleware/
│   │   ├── confirmation-gate.js # HIGH-risk action guard
│   │   └── sanitizer.js        # Prompt injection blocker
│   ├── security/
│   │   └── defender.js         # Content sanitization
│   ├── dashboard/
│   │   ├── main.py             # FastAPI server
│   │   └── static/index.html   # Dashboard UI
│   ├── hermes/
│   │   └── memory.py           # SQLite memory + strategy enforcement
│   ├── skills/
│   │   ├── activity-log.js     # Activity tracking
│   │   └── research.js         # Web research
│   └── voice/
│       └── voice.py            # Kokoro TTS
├── skills/                     # Plugin definitions (YAML + JS)
├── test/                       # Smoke tests
├── data/                       # SQLite DB, active_model.txt (gitignored)
├── docs/                       # Extended documentation
├── site/                       # korvin.cloud (GitHub Pages)
├── config.example.json
├── docker-compose.yml
├── install.sh
├── quickstart.md
└── KORVIN.md                   # Base system prompt template
```

---

## Roadmap

- [x] Telegram bot — text and voice
- [x] Persistent SQLite memory with strategy management
- [x] Named session save / load
- [x] VirusTotal + Lynis security scanning
- [x] FastAPI dashboard — model switcher, memory browser, killswitch
- [x] LiteLLM proxy — model-agnostic routing
- [x] Cloudflare Tunnel + Access integration
- [x] Kokoro TTS — local voice replies
- [ ] WhatsApp channel
- [ ] RAG over local documents
- [ ] Multi-agent task delegation
- [ ] Wake-word local voice client

---

## Documentation

- [Linux / VPS quickstart](quickstart.md) — guided setup on Ubuntu/Debian
- [Windows quickstart](quickstart-desktop.md) — full guide for Windows 10/11 including NSSM background services
- [Commands](docs/commands.md) — full Telegram command reference
- [Configuration](docs/configuration.md) — all config options
- [Deployment](docs/deployment.md) — systemd, Docker, Cloudflare Tunnel
- [Features](docs/korvin-features.md) — architecture deep dive

---

## Contributing

See [`CONTRIBUTORS.md`](CONTRIBUTORS.md).

## Security

See [`SECURITY.md`](SECURITY.md) for the responsible disclosure policy.

## License

MIT — see [`LICENSE.md`](LICENSE.md).

---

*Built by [NosisTech](https://korvin.cloud)*
