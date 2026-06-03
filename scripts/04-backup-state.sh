#!/bin/bash
set -euo pipefail

BACKUP_DIR="/home/korvin/.backup-repo"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
SNAPSHOT_DIR="$BACKUP_DIR/snapshots/$TIMESTAMP"

mkdir -p "$SNAPSHOT_DIR"

src="/home/korvin/korvin/docs/activity.md"
if [ -e "$src" ]; then
  cp "$src" "$SNAPSHOT_DIR/"
  echo "  activity.md"
fi

src="/home/korvin/korvin/logs/"
if [ -e "$src" ]; then
  cp -r "$src" "$SNAPSHOT_DIR/"
  echo "  logs/"
fi

src="/home/korvin/korvin/data/active_model.txt"
if [ -e "$src" ]; then
  cp "$src" "$SNAPSHOT_DIR/"
  echo "  active_model.txt"
fi

cd "$BACKUP_DIR"
git add -A
git commit -m "State snapshot $TIMESTAMP" 2>/dev/null || true
if ! git push origin main; then
  echo "Backup snapshot created, but git push failed." >&2
  exit 1
fi

echo "Backup completed."
