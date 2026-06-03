#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="korvin"
# Every channel/add-on the killswitch stops; NEVER include korvin-dashboard.service (recovery console). Future add-ons append their unit name here.
KILLABLE_SERVICES="litellm.service korvin-egress-broker.service korvin.service"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/korvin"
REPO_URL="${KORVIN_REPO_URL:-https://github.com/nosistech/korvin.git}"
ENV_FILE="/etc/korvin.env"
SKILL_USER="korvin-skill"
LITELLM_CONFIG="${APP_HOME}/litellm_config.yaml"
CONFIG_FILE="${APP_DIR}/config.json"
TOTAL_STEPS=7
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "${SCRIPT_DIR}/scripts/install-lib.sh"

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
    echo "Unsupported OS detected. Proceeding anyway - manual verification recommended."
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

  install_node20_if_needed
}

create_app_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "${APP_USER}"
  fi
}

clone_repo() {
  clone_or_update_repo_ff "${APP_USER}" "${APP_DIR}" "${REPO_URL}"
}

install_app_deps() {
  runuser -u "${APP_USER}" -- python3 -m venv "${APP_DIR}/venv"
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install --upgrade pip setuptools wheel
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install -r "${APP_DIR}/requirements.txt"
  runuser -u "${APP_USER}" -- "${APP_DIR}/venv/bin/python" -m pip install 'litellm[proxy]'
  runuser -u "${APP_USER}" -- npm --prefix "${APP_DIR}" install
}

write_env_file() {
  local telegram_bot_token="$1"
  local korvin_chat_id="$2"
  local deepseek_api_key="$3"
  local gemini_api_key="$4"
  local litellm_master_key="$5"
  local korvin_api_key="$6"
  local korvin_dashboard_token="$7"
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
MIMO_API_KEY=
LITELLM_MASTER_KEY=${litellm_master_key}
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_KEY=${litellm_master_key}
KORVIN_API_KEY=${korvin_api_key}
KORVIN_DASHBOARD_TOKEN=${korvin_dashboard_token}
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

create_skill_user() {
  if ! id "${SKILL_USER}" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "${SKILL_USER}" || return 1
  fi
  chmod o+x "${APP_HOME}" || return 1
}

setup_skill_firewall() {
  local control_port="$1"
  local proxy_port="$2"

  echo "iptables-persistent iptables-persistent/autosave_v4 boolean false" | debconf-set-selections || return 1
  echo "iptables-persistent iptables-persistent/autosave_v6 boolean false" | debconf-set-selections || return 1
  DEBIAN_FRONTEND=noninteractive apt-get install -y iptables iptables-persistent || return 1

  iptables -N KORVIN_SKILL_EGRESS 2>/dev/null || iptables -F KORVIN_SKILL_EGRESS || return 1
  iptables -A KORVIN_SKILL_EGRESS -d 127.0.0.1 -p tcp --dport "${proxy_port}" -j ACCEPT || return 1
  iptables -A KORVIN_SKILL_EGRESS -j REJECT --reject-with icmp-port-unreachable || return 1
  iptables -C OUTPUT -m owner --uid-owner "${SKILL_USER}" -j KORVIN_SKILL_EGRESS 2>/dev/null \
    || iptables -I OUTPUT -m owner --uid-owner "${SKILL_USER}" -j KORVIN_SKILL_EGRESS || return 1

  ip6tables -N KORVIN_SKILL_EGRESS 2>/dev/null || ip6tables -F KORVIN_SKILL_EGRESS || return 1
  ip6tables -A KORVIN_SKILL_EGRESS -j REJECT --reject-with icmp6-port-unreachable || return 1
  ip6tables -C OUTPUT -m owner --uid-owner "${SKILL_USER}" -j KORVIN_SKILL_EGRESS 2>/dev/null \
    || ip6tables -I OUTPUT -m owner --uid-owner "${SKILL_USER}" -j KORVIN_SKILL_EGRESS || return 1

  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save || return 1
  else
    mkdir -p /etc/iptables || return 1
    iptables-save > /etc/iptables/rules.v4 || return 1
    ip6tables-save > /etc/iptables/rules.v6 || return 1
  fi

  return 0
}

write_skill_sudoers() {
  local NODE_BIN="/usr/bin/node"
  local RUNNER_PATH="${APP_DIR}/src/skills/sandbox-runner.js"

  # SETENV only lets korvin de-escalate into korvin-skill; korvin-skill gets no sudo rights back.
  printf '%s ALL=(%s) NOPASSWD:SETENV: %s %s\n' "${APP_USER}" "${SKILL_USER}" "${NODE_BIN}" "${RUNNER_PATH}" > /etc/sudoers.d/korvin-skill || return 1
  chown root:root /etc/sudoers.d/korvin-skill || return 1
  chmod 0440 /etc/sudoers.d/korvin-skill || return 1
  if ! visudo -cf /etc/sudoers.d/korvin-skill; then
    rm -f /etc/sudoers.d/korvin-skill
    return 1
  fi
}

write_killswitch_sudoers() {
  local SYSTEMCTL_BIN="/usr/bin/systemctl"
  local commands="" service sep=""

  for service in ${KILLABLE_SERVICES}; do
    commands="${commands}${sep}${SYSTEMCTL_BIN} stop ${service}, ${SYSTEMCTL_BIN} start ${service}"
    sep=", "
  done

  printf '%s ALL=(root) NOPASSWD: %s\n' "${APP_USER}" "${commands}" > /etc/sudoers.d/korvin-killswitch || return 1
  chown root:root /etc/sudoers.d/korvin-killswitch || return 1
  chmod 0440 /etc/sudoers.d/korvin-killswitch || return 1
  if ! visudo -cf /etc/sudoers.d/korvin-killswitch; then
    rm -f /etc/sudoers.d/korvin-killswitch
    return 1
  fi
}

disable_network_skills() {
  runuser -u "${APP_USER}" -- /usr/bin/node -e "require('${APP_DIR}/src/capabilities/registry').seedIfMissing()" || return 1

  CAPABILITIES_FILE="${APP_DIR}/data/capabilities.json" python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path(os.environ["CAPABILITIES_FILE"])
data = json.loads(path.read_text(encoding="utf-8"))
for entry in data.values() if isinstance(data, dict) else data:
    if isinstance(entry, dict) and isinstance(entry.get("allowlist"), list) and entry["allowlist"]:
        entry["enabled"] = False
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/data/capabilities.json" || return 1
}

configure_skill_isolation() {
  local control_port proxy_port
  control_port="$(pick_free_port 4100)"
  proxy_port="$(pick_free_port $((control_port + 1)))"

  local ok=1
  if ! create_skill_user; then ok=0; fi
  if [ "${ok}" -eq 1 ] && ! setup_skill_firewall "${control_port}" "${proxy_port}"; then ok=0; fi
  if [ "${ok}" -eq 1 ] && ! write_skill_sudoers; then ok=0; fi

  {
    echo "KORVIN_EGRESS_CONTROL_PORT=${control_port}"
    echo "KORVIN_EGRESS_PROXY_PORT=${proxy_port}"
    echo "KORVIN_KILLABLE_SERVICES=\"${KILLABLE_SERVICES}\""
  } >> "${ENV_FILE}"

  if [ "${ok}" -eq 1 ]; then
    echo "KORVIN_SKILL_USER=${SKILL_USER}" >> "${ENV_FILE}"
    echo "Skill isolation: ENABLED (${SKILL_USER} + iptables egress lockdown, ports ${control_port}/${proxy_port})"
  else
    disable_network_skills || true
    echo
    echo "WARNING: OS skill-isolation could not be configured."
    echo "WARNING: Network skills are DISABLED in degraded mode."
    echo "WARNING: Read-only skills still run as ${APP_USER}; app-layer proxy controls are advisory."
    echo
  fi
}

install_searxng() {
  # RAM guard: SearXNG needs ~200 MB headroom; skip if < 1.2 GB free.
  local mem_kb
  mem_kb=$(awk '/MemAvailable/{print $2}' /proc/meminfo) || return 1
  if [ "${mem_kb}" -lt 1228800 ]; then
    echo "INFO: SearXNG skipped - less than 1.2 GB RAM free (${mem_kb} kB)."
    echo "INFO: Research skill will use DuckDuckGo lite fallback."
    return 0
  fi

  local SEARXNG_DIR="/opt/korvin-searxng"
  local SEARXNG_CFG="/etc/searxng/settings.yml"
  local SEARXNG_PORT=8888
  local SEARXNG_URL="http://127.0.0.1:${SEARXNG_PORT}"

  # 1. Ensure git and python3-venv are available (idempotent).
  apt-get install -y --no-install-recommends git python3-venv python3-dev 1>/dev/null || return 1

  # 2. Clone SearXNG shallow if not already present.
  if [ ! -d "${SEARXNG_DIR}/.git" ]; then
    git clone --depth 1 https://github.com/searxng/searxng.git "${SEARXNG_DIR}" 1>/dev/null || return 1
  fi

  # 3. Create virtualenv and install dependencies.
  if [ ! -d "${SEARXNG_DIR}/venv" ]; then
    python3 -m venv "${SEARXNG_DIR}/venv" || return 1
  fi
  "${SEARXNG_DIR}/venv/bin/pip" install --quiet --upgrade pip 1>/dev/null || return 1
  "${SEARXNG_DIR}/venv/bin/pip" install --quiet -r "${SEARXNG_DIR}/requirements.txt" 1>/dev/null || return 1
  "${SEARXNG_DIR}/venv/bin/pip" install --quiet -r "${SEARXNG_DIR}/requirements-server.txt" 1>/dev/null || return 1

  # 4. Write configuration.
  mkdir -p /etc/searxng || return 1
  local secret_key
  secret_key=$(random_hex 32) || return 1
  cat > "${SEARXNG_CFG}" <<YAMLEOF || return 1
use_default_settings: true
server:
  secret_key: "${secret_key}"
  bind_address: "127.0.0.1"
  port: ${SEARXNG_PORT}
  limiter: false
  public_instance: false
search:
  formats:
    - html
    - json
YAMLEOF
  chown "${APP_USER}:${APP_USER}" "${SEARXNG_CFG}" || return 1
  chmod 0640 "${SEARXNG_CFG}" || return 1
  chown -R "${APP_USER}:${APP_USER}" "${SEARXNG_DIR}" || return 1

  # 5. Write systemd unit.
  cat > /etc/systemd/system/korvin-searxng.service <<EOF || return 1
[Unit]
Description=SearXNG private search for Korvin
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${SEARXNG_DIR}
ExecStart=${SEARXNG_DIR}/venv/bin/granian --interface wsgi --host 127.0.0.1 --port ${SEARXNG_PORT} --no-ws searx.webapp:app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # 6. Persist the URL to the environment file read by all Korvin units.
  echo "KORVIN_SEARXNG_URL=${SEARXNG_URL}" >> "${ENV_FILE}" || return 1

  # 7. Enable and start the service.
  systemctl daemon-reload || return 1
  systemctl enable --now korvin-searxng.service || return 1
}

write_systemd_services() {
  cat > /etc/systemd/system/korvin.service <<EOF
[Unit]
Description=Korvin Telegram Bot
After=network-online.target litellm.service korvin-egress-broker.service
Wants=network-online.target litellm.service korvin-egress-broker.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/src/openclaw/telegram-bot.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/korvin-dashboard.service <<EOF
[Unit]
Description=Korvin FastAPI Dashboard
After=network-online.target litellm.service korvin-egress-broker.service
Wants=network-online.target litellm.service korvin-egress-broker.service

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

  cat > /etc/systemd/system/korvin-egress-broker.service <<EOF
[Unit]
Description=Korvin Egress Broker
After=network-online.target
Wants=network-online.target
Before=korvin.service korvin-dashboard.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/src/skills/egress-broker.js
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
  systemctl enable --now korvin-egress-broker.service litellm.service korvin-dashboard.service korvin.service
}

main() {
  require_root
  require_supported_os

  read_optional_telegram_token
  read_optional_chat_id
  read_llm_key
  read_secret "Dashboard login password (12+ chars recommended)" KORVIN_DASHBOARD_TOKEN
  KORVIN_API_KEY=$(random_hex 16)
  LITELLM_MASTER_KEY=$(random_hex 32)
  echo "Internal API key and LiteLLM key: auto-generated"

  step 1 "Checking and installing system dependencies"
  install_system_deps
  step 2 "Creating application user"
  create_app_user
  step 3 "Downloading Korvin"
  clone_repo
  install_app_deps
  install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}/data"
  if [ -n "${GEMINI_API_KEY}" ]; then
    printf "gemini-flash" > "${APP_DIR}/data/active_model.txt"
  else
    printf "deepseek-v4-pro" > "${APP_DIR}/data/active_model.txt"
  fi
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/data/active_model.txt"
  runuser -u "${APP_USER}" -- /usr/bin/node -e "require('${APP_DIR}/src/capabilities/registry').seedIfMissing()" || true
  step 4 "Writing configuration"
  write_env_file "${TELEGRAM_BOT_TOKEN}" "${KORVIN_CHAT_ID}" "${DEEPSEEK_API_KEY}" "${GEMINI_API_KEY}" "${LITELLM_MASTER_KEY}" "${KORVIN_API_KEY}" "${KORVIN_DASHBOARD_TOKEN}"
  write_config_json "${TELEGRAM_BOT_TOKEN}"
  write_litellm_config
  configure_skill_isolation
  if ! write_killswitch_sudoers; then
    echo
    echo "WARNING: Hard killswitch sudoers could not be configured."
    echo "WARNING: Hard service stop/start is unavailable in degraded mode."
    echo "WARNING: The soft read-only killswitch flag still applies."
    echo
  fi
  step 5 "Installing SearXNG (private search)"
  if ! install_searxng; then
    echo
    echo "WARNING: SearXNG could not be installed."
    echo "WARNING: Research skill will use DuckDuckGo lite fallback."
    echo
  fi
  write_systemd_services
  step 6 "Starting services"
  start_services

  step 7 "Complete"
  SERVER_IP=$(detect_server_ip)
  echo
  echo "=============================="
  echo " Korvin installed successfully"
  echo "=============================="
  echo
  echo "Dashboard: http://${SERVER_IP}:3002"
  echo "Dashboard login: use the password you entered during install"
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
