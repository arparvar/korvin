# Korvin Desktop Quickstart

Get Korvin running in 5 minutes - dashboard ready, no Telegram required.

## Requirements

- Ubuntu 22.04 or 24.04 (VPS or local machine)
- Root access
- A DeepSeek or Gemini API key

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/nosistech/korvin/main/install-desktop.sh | sudo bash
```

## What you get immediately

- Dashboard chat at http://YOUR_IP:3002
- Model switching (DeepSeek / Gemini)
- 5 skills: research, scheduling, drafting, security, inbox
- Rate limiting and prompt injection protection

## Add Telegram later (optional)

1. Create a bot at https://t.me/BotFather
2. Add to /etc/korvin.env:

```bash
TELEGRAM_BOT_TOKEN=your_token
KORVIN_CHAT_ID=your_chat_id
```

3. Start Telegram:

```bash
sudo systemctl start korvin.service
```

## Security

- Dashboard is localhost-only by default
- Use Cloudflare Tunnel or Nginx reverse proxy to expose it safely
- Never expose port 3002 directly to the internet without auth
