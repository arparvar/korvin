# task-automator

**Trigger:** "Every [schedule] do [action]"  
_or_ "Remind me to [action] every [schedule]"

**Action:**
1. Parse the natural‑language instruction for schedule and action.
2. Convert the schedule to a cron expression.
3. Create a cron job on the host that calls Korvin’s agent with the action.
4. Confirm the cron job to the user and offer a one‑click cancel option.

**Example:**  
User: *“Every Monday at 9 AM remind me to check invoices”*  
→ Creates `0 9 * * 1` cron job that sends a Telegram reminder.
