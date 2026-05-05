#!/bin/bash
set -euo pipefail
CONFIG="${1:-/home/korvin/korvin/config.json}"
if [ ! -f "$CONFIG" ]; then echo "Config not found: $CONFIG"; exit 1; fi
OR_KEY=$(node -e "const c=require('${CONFIG}'); console.log(c.openrouter_key||c.OPENROUTER_API_KEY||c.api_key||'')" 2>/dev/null)
if [ -z "$OR_KEY" ]; then echo "No OpenRouter key found in config."; exit 1; fi
echo "Auditing key…"
echo ""
echo "Test 1: Billing access"
CREDITS=$(curl -s -o /dev/null -w "%{http_code}" https://openrouter.ai/api/v1/credits -H "Authorization: Bearer $OR_KEY")
[ "$CREDITS" = "200" ] && echo "⚠️  Key can read billing data" || echo "✅ Billing is blocked"
echo ""
echo "Test 2: Key management"
KEYS=$(curl -s -o /dev/null -w "%{http_code}" https://openrouter.ai/api/v1/keys -H "Authorization: Bearer $OR_KEY")
[ "$KEYS" = "200" ] && echo "🚨 Key can manage other keys — revoke immediately!" || echo "✅ Key management is blocked"
echo ""
echo "Test 3: Inference (should work)"
MODELS=$(curl -s -o /dev/null -w "%{http_code}" https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OR_KEY")
[ "$MODELS" = "200" ] && echo "✅ Inference access confirmed" || echo "❌ Inference failed"
