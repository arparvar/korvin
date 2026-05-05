# inbox-summarizer

**Trigger:** Automatic daily at a user‑configured time (default 8 AM)

**Action:**
1. Connect to Gmail or Outlook via OAuth 2.0 (never password).
2. Scan the inbox for the last 24 hours.
3. Categorize emails: urgent, replies needed, newsletters, etc.
4. Deliver a Telegram summary: *“12 emails today. 3 urgent. 2 need replies.”*
5. All processing happens locally — no email content ever leaves the VPS.

**Setup:** User triggers “Connect email” during the wizard or from Settings.
