# security-monitor

**Trigger:** Automatic weekly report (runs every Monday at 8 AM)

**Action:**
1. Check VPS health (disk, RAM, CPU).
2. Report API credit balances (DeepSeek, etc.).
3. Verify all Korvin services are running (gateway, dashboard, bot).
4. Check threat monitor for new CVEs and advisories.
5. Deliver a Telegram report: *“VPS healthy. API balance: $12.50. No alerts.”*

**Setup:** Activated automatically — no user action needed.
