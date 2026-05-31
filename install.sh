#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="korvin"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/korvin"
REPO_URL="${KORVIN_REPO_URL:-https://github.com/nosistech/korvin.git}"
ENV_FILE="/etc/korvin.env"
LITELLM_CONFIG="${APP_HOME}/litellm_config.yaml"
CONFIG_FILE="${APP_DIR}/config.json"
TOTAL_STEPS=6

step() {
  echo
  echo "[$1/${TOTAL_STEPS}] $2..."
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    echo "Run this installer as root: sudo bash install.sh"
    exit 1
  fi
}

require_supported_os() {
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] && [ "${ID:-}" != "debian" ]; then
    echo "Unsupported OS detected. Proceeding anyway ? manual verification recommended."
  fi
}

detect_server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
}

read_secret() {
  local prompt="$1"
  local var_name="$2"
  local value=""

  while [ -z "${value}" ]; do
    read -r -s -p "${prompt}: " value
    echo
    if [ -z "${value}" ]; then
      echo "This value is required."
    fi
  done

  printf -v "${var_name}" "%s" "${value}"
}

read_optional_telegram_token() {
  local value=""

  while true; do
    echo "Telegram Bot Token (optional - skip to use dashboard only, press Enter to skip):"
    read -r -s value
    echo

    if [ -z "${value}" ]; then
      TELEGRAM_BOT_TOKEN=""
      echo "Telegram: skipped (dashboard-only mode)"
      return
    fi

    if [ "${#value}" -gt 20 ] && [[ "${value}" == *:* ]]; then
      TELEGRAM_BOT_TOKEN="${value}"
      echo "Telegram: token set"
      return
    fi

    echo "Invalid Telegram token format. It should contain ':' and be longer than 20 characters."
  done
}

read_optional_chat_id() {
  local value=""

  echo "Korvin Chat ID (optional - press Enter to skip):"
  read -r -s value
  echo

  if [ -z "${value}" ]; then
    KORVIN_CHAT_ID=""
    echo "Korvin Chat ID: skipped"
  else
    KORVIN_CHAT_ID="${value}"
    echo "Korvin Chat ID: set"
  fi
}

read_llm_key() {
  local value=""

  while [ -z "${value}" ]; do
    read -r -s -p "LLM API key (Gemini or DeepSeek): " value
    echo
    if [ -z "${value}" ]; then
      echo "This value is required."
    fi
  done

  if [[ "${value}" == AIza* ]]; then
    GEMINI_API_KEY="${value}"
    DEEPSEEK_API_KEY=""
    echo "LLM provider: Gemini"
  else
    DEEPSEEK_API_KEY="${value}"
    GEMINI_API_KEY=""
    echo "LLM provider: DeepSeek"
  fi
}

install_system_deps() {
  apt-get update
  apt-get install -y ca-certificates curl ffmpeg gnupg git python3 python3-pip python3-venv

  if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v18\.'; then
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
  fi
}

create_app_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "${APP_USER}"
  fi
}

clone_repo() {
  if [ -d "${APP_DIR}/.git" ]; then
    runuser -u "${APP_USER}" -- git -C "${APP_DIR}" pull --ff-only
  elif [ -e "${APP_DIR}" ]; then
    echo "${APP_DIR} exists but is not a git checkout. Move it aside and rerun this installer."
    exit 1
  else
    runuser -u "${APP_USER}" -- git clone "${REPO_URL}" "${APP_DIR}"
  fi
}

install_app_deps() {
  runuser -u "${APP_USER}" -- python3 -m venv "${APP_DIR}/venv"
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install --upgrade pip setuptools wheel
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install -r "${APP_DIR}/requirements.txt"
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install litellm
  runuser -u "${APP_USER}" -- npm --prefix "${APP_DIR}" install
}

write_env_file() {
  local telegram_bot_token="$1"
  local korvin_chat_id="$2"
  local deepseek_api_key="$3"
  local gemini_api_key="$4"
  local litellm_master_key="$5"
  local korvin_api_key="$6"
  local korvin_model=""

  if [ -n "${gemini_api_key}" ]; then
    korvin_model="gemini-flash"
  else
    korvin_model="deepseek-v4-pro"
  fi

  umask 077
  cat > "${ENV_FILE}" <<EOF
TELEGRAM_BOT_TOKEN=${telegram_bot_token}
KORVIN_CHAT_ID=${korvin_chat_id}
DEEPSEEK_API_KEY=${deepseek_api_key}
GEMINI_API_KEY=${gemini_api_key}
LITELLM_MASTER_KEY=${litellm_master_key}
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_KEY=${litellm_master_key}
KORVIN_API_KEY=${korvin_api_key}
KORVIN_MODEL=${korvin_model}
KORVIN_DATA_DIR=${APP_DIR}/data
EOF
  chmod 600 "${ENV_FILE}"
}

write_config_json() {
  local telegram_bot_token="$1"

  CONFIG_FILE="${CONFIG_FILE}" TELEGRAM_BOT_TOKEN="${telegram_bot_token}" python3 - <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ["CONFIG_FILE"])
config_path.write_text(
    json.dumps({"telegramToken": os.environ["TELEGRAM_BOT_TOKEN"]}, indent=2) + "\n",
    encoding="utf-8",
)
PY
  chown "${APP_USER}:${APP_USER}" "${CONFIG_FILE}"
  chmod 600 "${CONFIG_FILE}"
}

write_litellm_config() {
  cat > "${LITELLM_CONFIG}" <<'EOF'
model_list:
  - model_name: deepseek-v4-pro
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY
  - model_name: deepseek-v4-flash
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY
  - model_name: gemini-flash
    litellm_params:
      model: gemini/gemini-1.5-flash
      api_key: os.environ/GEMINI_API_KEY

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
EOF
  chown "${APP_USER}:${APP_USER}" "${LITELLM_CONFIG}"
  chmod 600 "${LITELLM_CONFIG}"
}

write_systemd_services() {
  cat > /etc/systemd/system/korvin.service <<EOF
[Unit]
Description=Korvin Telegram Bot
After=network-online.target litellm.service
Wants=network-online.target litellm.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/src/openclaw/telegram-bot.js
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
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/venv/bin/uvicorn src.dashboard.main:app --host 127.0.0.1 --port 3002
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

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
}

start_services() {
  systemctl daemon-reload
  systemctl enable --now litellm.service korvin-dashboard.service korvin.service
}

main() {
  require_root
  require_supported_os

  read_optional_telegram_token
  read_optional_chat_id
  read_llm_key
  read_secret "Dashboard security key (choose any strong password)" KORVIN_API_KEY
  LITELLM_MASTER_KEY=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
  echo "Internal LiteLLM key: auto-generated"

  step 1 "Checking and installing system dependencies"
  install_system_deps
  step 2 "Creating application user"
  create_app_user
  step 3 "Downloading Korvin"
  clone_repo
  install_app_deps
  install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/data"
  step 4 "Writing configuration"
  write_env_file "${TELEGRAM_BOT_TOKEN}" "${KORVIN_CHAT_ID}" "${DEEPSEEK_API_KEY}" "${GEMINI_API_KEY}" "${LITELLM_MASTER_KEY}" "${KORVIN_API_KEY}"
  write_config_json "${TELEGRAM_BOT_TOKEN}"
  write_litellm_config
  write_systemd_services
  step 5 "Starting services"
  start_services

  step 6 "Complete"
  SERVER_IP=$(detect_server_ip)
  echo
  echo "=============================="
  echo " Korvin installed successfully"
  echo "=============================="
  echo
  echo "Dashboard: http://${SERVER_IP}:3002"
  echo "Dashboard key: ${KORVIN_API_KEY}"
  echo
  echo "To check services:"
  echo "  systemctl status korvin-dashboard.service"
  echo "  systemctl status litellm.service"
  if [ -z "${TELEGRAM_BOT_TOKEN}" ]; then
    echo
    echo "Telegram: not configured"
    echo "  To add later: edit /etc/korvin.env and run:"
    echo "  sudo systemctl start korvin.service"
  else
    echo
    echo "Telegram: active"
  fi
  echo
  echo "Config: /etc/korvin.env"
  echo "App: ${APP_DIR}"
}

main "$@"
