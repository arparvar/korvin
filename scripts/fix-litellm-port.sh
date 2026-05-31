#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run as root: sudo bash scripts/fix-litellm-port.sh" >&2
  exit 1
fi

SERVICE="/etc/systemd/system/litellm.service"

if [ ! -f "$SERVICE" ]; then
  echo "Missing $SERVICE" >&2
  exit 1
fi

if grep -q -- '--host 0\.0\.0\.0' "$SERVICE"; then
  sed -i 's/--host 0\.0\.0\.0/--host 127.0.0.1/g' "$SERVICE"
  systemctl daemon-reload && systemctl restart litellm.service
  echo "LiteLLM is now bound to 127.0.0.1:4000 only."
elif grep -q -- '--host 127\.0\.0\.1' "$SERVICE"; then
  echo "Already fixed."
else
  echo "Could not find LiteLLM --host setting in $SERVICE" >&2
  exit 1
fi
