#!/bin/bash
set -euo pipefail
BACKUP_DIR="/home/korvin/.backup-repo"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
mkdir -p "$BACKUP_DIR/snapshots/$TIMESTAMP"

# Back up activity log
src="/home/korvin/korvin/docs/activity.md"
[ -e "$src" ] && cp "$src" "$BACKUP_DIR/snapshots/$TIMESTAMP/" && echo "  ✅ activity.md"

# Back up logs (not memory.db — conversation history stays local only)
src="/home/korvin/korvin/logs/"
[ -e "$src" ] && cp -r "$src" "$BACKUP_DIR/snapshots/$TIMESTAMP/" && echo "  ✅ logs/"

# Back up active model selection only — not the full data folder
src="/home/korvin/korvin/data/active_model.txt"
[ -e "$src" ] && cp "$src" "$BACKUP_DIR/snapshots/$TIMESTAMP/" && echo "  ✅ active_model.txt"

cd "$BACKUP_DIR"
git add -A
git commit -m "State snapshot $TIMESTAMP" 2>/dev/null || true
git push origin main 2>/dev/null
echo "Backup completed."