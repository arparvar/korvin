#!/usr/bin/env bash

random_hex() {
  local bytes="$1"
  openssl rand -hex "$bytes" 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex($bytes))"
}

pick_free_port() {
  local p="$1"
  while ss -Htln "sport = :${p}" 2>/dev/null | grep -q .; do
    p=$((p + 1))
  done
  printf '%s' "${p}"
}

install_node20_if_needed() {
  if command -v node >/dev/null 2>&1 && node --version | grep -qE '^v(2[0-9]|[3-9][0-9])\.'; then
    return
  fi
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  chmod 0644 /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
}

clone_or_update_repo_ff() {
  local app_user="$1"
  local app_dir="$2"
  local repo_url="$3"
  if [ -d "${app_dir}/.git" ]; then
    runuser -u "${app_user}" -- git -C "${app_dir}" pull --ff-only
  elif [ -e "${app_dir}" ]; then
    echo "${app_dir} exists but is not a git checkout. Move it aside and rerun this installer."
    exit 1
  else
    runuser -u "${app_user}" -- git clone "${repo_url}" "${app_dir}"
  fi
}
