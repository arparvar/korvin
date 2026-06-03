#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="korvin"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/korvin"
REPO_URL="${KORVIN_REPO_URL:-https://github.com/nosistech/korvin.git}"
ENV_FILE="/etc/korvin.env"
LITELLM_CONFIG="${APP_HOME}/litellm_config.yaml"
CONFIG_FILE="${APP_DIR}/config.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/scripts/install-lib.sh"

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    echo "Run this installer as root: sudo bash install-desktop.sh"
    exit 1
  fi
}

require_debian_or_ubuntu() {
  if [ ! -r /etc/os-release ]; then
    echo "Unsupported OS: /etc/os-release not found. Use Ubuntu or Debian."
    exit 1
  fi

  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *)
      echo "Unsupported OS: ${PRETTY_NAME:-unknown}. Use Ubuntu or Debian."
      exit 1
      ;;
  esac
}

read_required_secret() {
  local prompt="$1"
  local var_name="$2"
  local value=""

  while [ -z "${value}" ]; do
    read -r -s -p "${prompt}" value
    echo
    if [ -z "${value}" ]; then
      echo "This value is required."
    fi
  done

  printf -v "${var_name}" "%s" "${value}"
}

install_system_deps() {
  apt-get update
  apt-get install -y python3 python3-pip python3-venv curl git ca-certificates gnupg
  install_node20_if_needed
}

create_app_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "${APP_USER}"
  fi
}

clone_or_update_repo() {
  clone_or_update_repo_ff "${APP_USER}" "${APP_DIR}" "${REPO_URL}"
}

install_app_deps() {
  runuser -u "${APP_USER}" -- npm --prefix "${APP_DIR}" install
  runuser -u "${APP_USER}" -- python3 -m venv "${APP_DIR}/venv"
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install --upgrade pip setuptools wheel
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install fastapi uvicorn httpx sqlite-utils python-multipart requests
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install litellm
  install_desktop_whisper_stub
}

install_desktop_whisper_stub() {
  if runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -c "import whisper" >/dev/null 2>&1; then
    return
  fi

  local site_packages
  site_packages="$(runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" - <<'PY'
import site
print(site.getsitepackages()[0])
PY
)"

  cat > "${site_packages}/whisper.py" <<'PY'
def load_model(*_args, **_kwargs):
    raise RuntimeError("Voice transcription is not installed in desktop mode. Install full voice dependencies to enable it.")
PY
  chown "${APP_USER}:${APP_USER}" "${site_packages}/whisper.py"
}

detect_llm_provider() {
  if [[ "${LLM_API_KEY}" == AIza* ]]; then
    DEEPSEEK_API_KEY=""
    GEMINI_API_KEY="${LLM_API_KEY}"
    KORVIN_MODEL="gemini-flash"
    echo "LLM API key: set for Gemini"
  else
    DEEPSEEK_API_KEY="${LLM_API_KEY}"
    GEMINI_API_KEY=""
    KORVIN_MODEL="deepseek-v4-pro"
    echo "LLM API key: set for DeepSeek"
  fi
}

write_env_file() {
  umask 077
  cat > "${ENV_FILE}" <<EOF
TELEGRAM_BOT_TOKEN=
KORVIN_CHAT_ID=
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
GEMINI_API_KEY=${GEMINI_API_KEY}
MIMO_API_KEY=
LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_KEY=${LITELLM_MASTER_KEY}
KORVIN_API_KEY=${KORVIN_API_KEY}
KORVIN_DASHBOARD_TOKEN=${KORVIN_DASHBOARD_TOKEN}
KORVIN_MODEL=${KORVIN_MODEL}
KORVIN_DATA_DIR=${APP_DIR}/data
EOF
  chmod 600 "${ENV_FILE}"
  chown root:root "${ENV_FILE}"
  echo "Dashboard password and internal API key: set"
}

write_config_json() {
  CONFIG_FILE="${CONFIG_FILE}" python3 - <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ["CONFIG_FILE"])
config_path.write_text(json.dumps({"telegramToken": ""}, indent=2) + "\n", encoding="utf-8")
PY
  chown "${APP_USER}:${APP_USER}" "${CONFIG_FILE}"
  chmod 600 "${CONFIG_FILE}"
}

write_litellm_config() {
  cat > "${LITELLM_CONFIG}" <<'EOF'
model_list:
  - model_name: gemini-flash
    litellm_params:
      model: gemini/gemini-2.5-flash
      api_key: os.environ/GEMINI_API_KEY
      rpm: 60
  - model_name: deepseek-v4-flash
    litellm_params:
      model: deepseek/deepseek-v4-flash
      api_key: os.environ/DEEPSEEK_API_KEY
      rpm: 60
  - model_name: deepseek-v4-pro
    litellm_params:
      model: deepseek/deepseek-v4-pro
      api_key: os.environ/DEEPSEEK_API_KEY
      rpm: 30
  - model_name: mimo-v2.5
    litellm_params:
      model: openai/mimo-v2.5
      api_base: https://api.xiaomimimo.com/v1
      api_key: os.environ/MIMO_API_KEY
      rpm: 60
  - model_name: mimo-v2.5-pro
    litellm_params:
      model: openai/mimo-v2.5-pro
      api_base: https://api.xiaomimimo.com/v1
      api_key: os.environ/MIMO_API_KEY
      rpm: 30

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
EOF
  chown "${APP_USER}:${APP_USER}" "${LITELLM_CONFIG}"
  chmod 600 "${LITELLM_CONFIG}"
}

write_systemd_services() {
  cat > /etc/systemd/system/litellm.service <<EOF
[Unit]
Description=LiteLLM Proxy for Korvin
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_HOME}
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/venv/bin/litellm --config ${LITELLM_CONFIG} --host 127.0.0.1 --port 4000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/korvin-dashboard.service <<EOF
[Unit]
Description=Korvin FastAPI Dashboard
After=network-online.target litellm.service
Wants=network-online.target litellm.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/venv/bin/uvicorn src.dashboard.main:app --host 127.0.0.1 --port 3002
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/korvin.service <<EOF
[Unit]
Description=Korvin Telegram Bot
After=network-online.target litellm.service
Wants=network-online.target litellm.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/src/openclaw/telegram-bot.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

start_desktop_services() {
  systemctl daemon-reload
  systemctl enable --now litellm.service korvin-dashboard.service
}

main() {
  require_root
  require_debian_or_ubuntu

  read_required_secret "Enter your LLM API key (DeepSeek or Gemini): " LLM_API_KEY
  read_required_secret "Enter a dashboard login password (12+ chars recommended): " KORVIN_DASHBOARD_TOKEN
  KORVIN_API_KEY=$(random_hex 16)
  LITELLM_MASTER_KEY=$(random_hex 32)
  detect_llm_provider

  install_system_deps
  create_app_user
  clone_or_update_repo
  install_app_deps
  install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/data"
  write_env_file
  write_config_json
  write_litellm_config
  write_systemd_services
  start_desktop_services

  echo
  echo "Korvin dashboard installed!"
  echo "Open: http://YOUR_SERVER_IP:3002 (or set up Cloudflare Tunnel)"
  echo "Dashboard login: use the password you entered during install"
  echo
  echo "Optional: add Telegram by editing /etc/korvin.env and running:"
  echo "  sudo systemctl start korvin.service"
}

main "$@"
