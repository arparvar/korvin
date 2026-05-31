# Korvin Quickstart

This guide starts from a fresh Ubuntu 24.04 VPS and gets Korvin running as a Telegram bot, FastAPI dashboard, and LiteLLM proxy. The installer creates a `korvin` Linux user, clones the repo into `/home/korvin/korvin`, installs dependencies, writes `/etc/korvin.env`, creates systemd services, and starts everything.

Do not paste real API keys into tickets, chat logs, screenshots, or public terminals.

## Prerequisites

- Fresh Ubuntu 24.04 VPS (1 vCPU, 2GB RAM minimum, 10GB disk)
- A domain name pointing to your VPS IP (for the dashboard)
- A Telegram bot token (from @BotFather)
- An OpenAI API key (or compatible LLM provider key)
- SSH access to the VPS as root

The current installer prompts for DeepSeek and Gemini provider keys because LiteLLM is configured with `deepseek-v4-pro`, `deepseek-v4-flash`, and `gemini-flash`.

## Step 1 — Download and run the installer

After you are logged into the VPS as root, download and run the installer:

```bash
cd /root
curl -fsSL https://raw.githubusercontent.com/nosistech/korvin/main/install.sh -o install.sh
bash install.sh
```

Expected output while it runs:

- The installer asks for five secret values.
- `apt-get update` and `apt-get install` print package download and install progress.
- If Node.js 18 is not already installed, the installer adds the NodeSource Node 18 repository and installs `nodejs`.
- The installer creates the `korvin` user if it does not already exist.
- The installer clones or updates `https://github.com/nosistech/korvin.git` into `/home/korvin/korvin`.
- Python and Node dependencies install.
- systemd services are written and started.

Expected output when it finishes:

```text
Korvin install complete.
Services: korvin.service, korvin-dashboard.service, litellm.service
Dashboard: http://127.0.0.1:3002
LiteLLM: http://127.0.0.1:4000
```

## Step 2 — Configure your secrets

The installer prompts for these values in this exact order. The input is hidden while you type or paste each secret.

```text
Telegram bot token:
DeepSeek API key:
Gemini API key:
LiteLLM master key:
Korvin dashboard API key:
```

What to paste:

- `Telegram bot token`: paste the token from @BotFather for your Telegram bot.
- `DeepSeek API key`: paste your DeepSeek API key. This powers the default `deepseek-v4-pro` and `deepseek-v4-flash` models.
- `Gemini API key`: paste your Gemini API key. This powers the `gemini-flash` model.
- `LiteLLM master key`: paste a private random key from your password manager. Korvin uses this as the LiteLLM bearer token and writes it as `OPENAI_API_KEY` in `/etc/korvin.env`.
- `Korvin dashboard API key`: paste a second private random key from your password manager. The dashboard uses this as `X-Korvin-Key`.

If you press Enter without typing a value, expected output is:

```text
This value is required.
```

The installer stores secrets in:

```text
/etc/korvin.env
/home/korvin/korvin/config.json
/home/korvin/litellm_config.yaml
```

Those files are created with restricted permissions. Do not print them in shared logs.

## Step 3 — Verify services are running

Load the environment variables for the current root shell:

```bash
set -a
. /etc/korvin.env
set +a
```

Expected output: no output.

Check LiteLLM:

```bash
systemctl is-active litellm.service
```

Expected output:

```text
active
```

Check the dashboard:

```bash
systemctl is-active korvin-dashboard.service
```

Expected output:

```text
active
```

Check the Telegram bot:

```bash
systemctl is-active korvin.service
```

Expected output:

```text
active
```

Check the dashboard API:

```bash
curl -s http://127.0.0.1:3002/api/status
```

Expected output:

```json
{"korvin":"online","version":"0.1.1","memory":"sqlite"}
```

Check the LiteLLM proxy:

```bash
curl -s http://127.0.0.1:4000/v1/models -H "Authorization: Bearer ${LITELLM_MASTER_KEY}"
```

Expected output: JSON containing the configured models, including names like `deepseek-v4-pro`, `deepseek-v4-flash`, and `gemini-flash`.

## Step 4 — Send your first message

Open Telegram and search for the bot username you created in @BotFather. Open the chat and send:

```text
/start
```

Expected output:

```text
Korvin - AI Security Agent

Commands:
/status - VPS health report
/scan [target] - Security scan (HIGH risk)
/patch <target> - Apply patch (HIGH risk)
/grill <topic> - Clarifying questions before research
/brief - Toggle concise mode (one-sentence answers)
/log - Recent activity
/pending - Pending confirmations
/help - this menu

Skills:
Type or say Research <topic> - web research + voice summary
Send any voice message - Korvin responds in voice
Send any text - Korvin replies
```

Then send:

```text
/help
```

Expected output: the same help menu.

The bot also activates stored scheduled jobs and the Monday 8AM security monitor when it starts.

## Step 5 — Try the 5 skills

Send each message in Telegram. The dashboard chat uses the same dispatcher for these skills.

1. Research

```text
Research the latest AI news
```

Expected output: Korvin returns a structured research report. In the live validation, this skill returned:

```text
Here's a structured report on Artificial Intelligence trends for 2025 based on the provided search results:

## AI Trends 2025 Report

Summary:
Artificial Intelligence in 2025 is characterized by its deep and pervasive integration into nearly every aspect of life...
```

2. Scheduling

```text
Every Monday do review my goals
```

Expected output:

```text
Scheduled: review my goals at 0 9 * * 1. ID: job-<generated-id>. Cancel with: /cancel job-<generated-id>
```

The validation output used a different task and generated ID:

```text
Scheduled: check invoices at 0 9 * * 1. ID: job-mpttvoyu-8piieh. Cancel with: /cancel job-mpttvoyu-8piieh
```

3. Document draft

```text
Write a report about productivity
```

Expected output: Korvin returns a full Markdown report for the requested topic. In the live validation, this skill returned:

```text
## Climate Change: An Urgent Global Assessment and Call to Action

Prepared for: [Recipient Name/Organization]
Prepared by: [Your Name/Department]
Date: [Current Date]

---

### Table of Contents

1. Executive Summary
2. Introduction
3. The Scientific Consensus and Evidence
```

For the productivity prompt, expect the same report structure with productivity as the topic.

4. Security report

```text
security report
```

Expected output:

```text
VPS Report 2026-05-31T13:41:15.240Z / Disk: 60% / RAM: 2227m/7940m / Services: all active / No external threat feed in v1.0.
```

Your timestamp, disk usage, and RAM numbers will match your VPS.

5. Inbox stub

```text
check my inbox
```

Expected output:

```text
Email integration is not configured yet. This feature requires OAuth setup with Gmail or Outlook. It will be available in v1.1.
```

## Step 6 — Access the dashboard

The installer starts the dashboard at:

```text
http://127.0.0.1:3002
```

Because it binds to `127.0.0.1`, it is not public by default. Point your Cloudflare Access application, tunnel, or reverse proxy at the local dashboard service on the VPS:

```text
http://127.0.0.1:3002
```

Use this public URL format:

```text
https://dashboard.your-domain.com
```

When you open the URL, Cloudflare Access shows its login screen first. Log in with the email or identity provider allowed by your Cloudflare Access policy. After Access approves you, the Korvin Dashboard loads.

Expected dashboard view:

- A left navigation with Home, Chat, Memory, Security, Settings, and Integrations.
- Home status rows for the agent, active model, Telegram, voice, and SQLite memory.
- A Chat page with a message list, a text input that says `Type a message...`, and a `Send` button.
- Memory, security, model switching, token usage, and timeout controls.

To verify dashboard chat, open the Chat page, send:

```text
security report
```

Expected output: the same VPS report format shown in Step 5.

## Troubleshooting

### Service not starting

Check the service status:

```bash
systemctl status korvin.service --no-pager
systemctl status korvin-dashboard.service --no-pager
systemctl status litellm.service --no-pager
```

Expected output for a healthy service includes:

```text
Active: active (running)
```

Check recent logs:

```bash
journalctl -u korvin.service -n 80 --no-pager
journalctl -u korvin-dashboard.service -n 80 --no-pager
journalctl -u litellm.service -n 80 --no-pager
```

After fixing the issue, restart all services:

```bash
systemctl restart litellm.service korvin-dashboard.service korvin.service
systemctl is-active litellm.service korvin-dashboard.service korvin.service
```

Expected output:

```text
active
active
active
```

### Bot not responding

Verify the Telegram token without printing the token:

```bash
set -a
. /etc/korvin.env
set +a
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

Expected output:

```json
{"ok":true,"result":{"id":123456789,"is_bot":true,"first_name":"Your Bot","username":"your_bot"}}
```

If `ok` is `false`, create a new token in @BotFather, edit `/etc/korvin.env` and `/home/korvin/korvin/config.json`, then restart:

```bash
systemctl restart korvin.service
systemctl is-active korvin.service
```

Expected output:

```text
active
```

### LiteLLM errors

Check LiteLLM health through the local proxy:

```bash
set -a
. /etc/korvin.env
set +a
curl -s http://127.0.0.1:4000/v1/models -H "Authorization: Bearer ${LITELLM_MASTER_KEY}"
```

Expected output: JSON with a `data` list of models.

Check logs:

```bash
journalctl -u litellm.service -n 120 --no-pager
```

Common fix after updating provider keys in `/etc/korvin.env`:

```bash
systemctl restart litellm.service korvin-dashboard.service korvin.service
systemctl is-active litellm.service korvin-dashboard.service korvin.service
```

Expected output:

```text
active
active
active
```

### Dashboard returns 403

The dashboard API requires the `KORVIN_API_KEY` from `/etc/korvin.env`. The bundled dashboard page injects this key automatically when served by FastAPI. If API calls return 403, reload the page through the dashboard URL and restart the dashboard service:

```bash
systemctl restart korvin-dashboard.service
systemctl is-active korvin-dashboard.service
```

Expected output:

```text
active
```

### Dashboard domain does not load

First verify the local dashboard on the VPS:

```bash
curl -s http://127.0.0.1:3002/api/status
```

Expected output:

```json
{"korvin":"online","version":"0.1.1","memory":"sqlite"}
```

If local works but the domain fails, fix the Cloudflare Access, tunnel, or reverse proxy target so it forwards to:

```text
http://127.0.0.1:3002
```
