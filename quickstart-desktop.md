# KORVIN — Windows Quickstart

Get KORVIN running on Windows 10 or 11. No VPS required. Everything runs locally.

**Time:** ~20 minutes for a full install including voice.

---

## Prerequisites

Install these before starting:

| Tool | Version | Download |
|---|---|---|
| Node.js | 20 or higher | [nodejs.org](https://nodejs.org) |
| Python | 3.10 or higher | [python.org](https://www.python.org/downloads) |
| Git | any | [git-scm.com](https://git-scm.com) |

> During Python install, check **"Add Python to PATH"** — otherwise `python` won't be recognized in PowerShell.

---

## 1. Clone the repo

Open PowerShell as a regular user (not Administrator):

```powershell
git clone https://github.com/nosistech/korvin.git C:\korvin
cd C:\korvin
```

---

## 2. Node dependencies

```powershell
npm install
```

---

## 3. Python virtual environment

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If you get a scripts execution error, run this once then retry:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Install Python dependencies:

```powershell
pip install -r requirements.txt
```

For voice support (Whisper + Kokoro TTS), also install:

```powershell
pip install -r requirements-voice.txt
```

---

## 4. Configure

```powershell
copy config.example.json config.json
notepad config.json
```

Fill in at minimum:

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

Get your Telegram bot token from [@BotFather](https://t.me/BotFather) — create a new bot, copy the token it gives you.

---

## 5. Set up environment variables

KORVIN reads secrets from environment variables, not config files. On Windows, set them as user environment variables or create a `.env` style loader.

**Option A — set user environment variables (recommended):**

```powershell
[System.Environment]::SetEnvironmentVariable("KORVIN_API_KEY", "your_dashboard_key", "User")
[System.Environment]::SetEnvironmentVariable("VIRUSTOTAL_API_KEY", "your_virustotal_key", "User")
[System.Environment]::SetEnvironmentVariable("LITELLM_MASTER_KEY", "your_litellm_key", "User")
```

Close and reopen PowerShell for them to take effect.

**Option B — set for the current session only:**

```powershell
$env:KORVIN_API_KEY = "your_dashboard_key"
$env:VIRUSTOTAL_API_KEY = "your_virustotal_key"
$env:LITELLM_MASTER_KEY = "your_litellm_key"
```

---

## 6. LiteLLM proxy

KORVIN routes all LLM calls through LiteLLM. Install it:

```powershell
pip install litellm
```

Create `C:\korvin\litellm_config.yaml`:

```yaml
model_list:
  - model_name: your-model-name
    litellm_params:
      model: openai/your-model-name
      api_base: https://api.yourprovider.com/v1
      api_key: YOUR_PROVIDER_API_KEY

general_settings:
  master_key: YOUR_LITELLM_MASTER_KEY
  drop_params: true
```

Start LiteLLM:

```powershell
litellm --config C:\korvin\litellm_config.yaml --port 4000 --host 127.0.0.1
```

Verify it's running:

```powershell
# Should return {"status":"healthy"}
curl http://127.0.0.1:4000/health
```

---

## 7. Update internal paths

KORVIN's default internal path is `/home/korvin/korvin` (Linux convention). If you cloned to `C:\korvin`, update the path references before starting:

In `src/openclaw/gateway.js` and `src/dashboard/main.py`, find any hardcoded `/home/korvin/korvin` references and replace with your actual clone path, e.g. `C:/korvin` (forward slashes work in Node.js on Windows).

---

## 8. Start KORVIN

Open three PowerShell windows:

**Window 1 — LiteLLM proxy:**

```powershell
cd C:\korvin
.\venv\Scripts\Activate.ps1
litellm --config C:\korvin\litellm_config.yaml --port 4000 --host 127.0.0.1
```

**Window 2 — bot:**

```powershell
cd C:\korvin
node src/openclaw/telegram-bot.js
```

**Window 3 — dashboard:**

```powershell
cd C:\korvin
.\venv\Scripts\Activate.ps1
uvicorn src.dashboard.main:app --host 127.0.0.1 --port 3002
```

Open `http://127.0.0.1:3002` in your browser. You should see the dashboard.

Send `/help` to your Telegram bot. You should get the command menu back.

---

## Voice (optional)

Voice requires a microphone and the voice dependencies:

```powershell
pip install -r requirements-voice.txt
```

Telegram voice messages work out of the box once the bot is running — send a voice message in Telegram and KORVIN will transcribe it with Whisper and reply with Kokoro TTS audio.

No wake-word client is needed for this. Voice messages go through the normal Telegram channel.

---

## Running in the background (no open terminal)

To keep KORVIN running after you close your terminal, use [NSSM](https://nssm.cc) (Non-Sucking Service Manager) to register each process as a Windows service.

**Install NSSM:**

Download from [nssm.cc/download](https://nssm.cc/download), extract, and add to your PATH.

**Register the bot as a service:**

```powershell
nssm install KorvinBot "C:\Program Files\nodejs\node.exe" "C:\korvin\src\openclaw\telegram-bot.js"
nssm set KorvinBot AppDirectory C:\korvin
nssm set KorvinBot AppEnvironmentExtra KORVIN_API_KEY=your_key LITELLM_MASTER_KEY=your_key
nssm start KorvinBot
```

**Register the dashboard:**

```powershell
nssm install KorvinDashboard "C:\korvin\venv\Scripts\uvicorn.exe" "src.dashboard.main:app --host 127.0.0.1 --port 3002"
nssm set KorvinDashboard AppDirectory C:\korvin
nssm start KorvinDashboard
```

Services start automatically on boot and restart on crash. Manage them from Services (`services.msc`) or via `nssm stop/start KorvinBot`.

---

## Verify everything is working

```powershell
# LiteLLM running on loopback
curl http://127.0.0.1:4000/health

# Dashboard running
curl http://127.0.0.1:3002/api/health

# Bot — send /status to your Telegram bot
```

Expected `/status` output:

```
🟢 KORVIN — online
CPU:    8%
RAM:    2.1 GB / 16 GB used
Uptime: 0 days, 0 hours
```

---

## Troubleshooting

**`uvicorn: command not found`**
Make sure your venv is activated (`.\venv\Scripts\Activate.ps1`) before running uvicorn.

**`python: command not found`**
Python was not added to PATH during install. Re-run the Python installer and check "Add Python to PATH", or use the full path: `C:\Users\YourName\AppData\Local\Programs\Python\Python310\python.exe`.

**`Cannot find module` errors in Node**
Run `npm install` from `C:\korvin` to install all Node dependencies.

**Dashboard shows but chat doesn't respond**
LiteLLM is probably not running, or the model name in `config.json` doesn't match a model in `litellm_config.yaml`. Check the bot terminal for error output.

**Telegram bot not responding**
Check that `telegramToken` in `config.json` is correct and the bot terminal shows "KORVIN online". Make sure you messaged the right bot — find it by the username you set in BotFather.

---

## Next steps

- [Commands reference](docs/commands.md) — full list of Telegram commands
- [Configuration](docs/configuration.md) — all config options
- [KORVIN.md](KORVIN.md) — customize the agent's personality and instructions
- [Deployment](docs/deployment.md) — expose the dashboard remotely via Cloudflare Tunnel
