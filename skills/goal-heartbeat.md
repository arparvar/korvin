# goal-heartbeat

**Trigger:** `/goal [text]` to set. Heartbeat fires automatically every 4 hours.

**Action (set):**
1. Save the goal text via `setGoal(text)`.
2. Persist the chat ID to `data/goal_chat.txt` so the heartbeat survives restarts.
3. Confirm to the user: "Goal set: [text]"

**Action (heartbeat):**
1. Read the saved goal from memory.
2. Read the chat ID from `data/goal_chat.txt`.
3. Send: "Goal check-in: [goal text]"

**Action (clear):** `/goal clear` removes the saved goal and stops heartbeat messages.

**Setup:** Activated automatically on bot start. No configuration needed.

**Security:** No external requests. Goal text is stored in SQLite via the existing goals module.
