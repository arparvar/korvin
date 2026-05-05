# KORVIN.local.example.md
# This is a filled-in EXAMPLE using fictional data.
# It shows you exactly what your KORVIN.local.md should look like when complete.
# This file is safe to commit to GitHub — it contains no real information.
#
# YOUR file is KORVIN.local.md — copy this, replace the fake data with yours.
# KORVIN.local.md is gitignored and never touches GitHub.

---

## 9. OPERATOR PROFILE

OPERATOR_NAME=Alex Rivera
OPERATOR_LOCATION=Austin, Texas, United States
OPERATOR_TIMEZONE=America/Chicago
OPERATOR_LANGUAGE=English

---

## 10. USE CONTEXT

USE_CONTEXT=founder

Alex is building a SaaS product for small law firms.
Consulting is the current revenue source while the product is in development.
Everything Korvin does should support speed to market and cost efficiency.

---

## 11. MEMORY PERSONA

MEMORY_PERSONA=I think out loud before I know what I am asking. Give me space to work through the framing before jumping to an answer. I paste terminal output without context and expect you to diagnose it. I work in short focused bursts and lose context quickly between sessions — always remind me where we left off when I say hello.

---

## 12. FOCUS MODE

CURRENT_FOCUS=Shipping MVP v1 of the contract analysis feature by end of Q2. Everything else is secondary.

---

## 13. BEHAVIOR PROFILE

BEHAVIOR_PROFILE=Show me options before acting on anything significant. Always tell me what you changed and what you left alone. When I am wrong about something technical, say so directly. Never summarize what I just said back to me as an opener.

---

## 14. FAILURE PERSONALITY

FAILURE_PERSONALITY=managed

---

## 15. TRUST ESCALATION

TRUST_RESEARCH=auto
TRUST_SYSTEM_COMMANDS=confirm
TRUST_EXTERNAL_CALLS=warn
TRUST_FILE_WRITES=warn
TRUST_MODEL_SWITCHING=confirm
TRUST_MEMORY_PRUNE=confirm

---

## 16. RHYTHM

TIMEZONE=America/Chicago
ACTIVE_HOURS=08:00-23:00

---

## 17. COST AWARENESS

MONTHLY_TOKEN_BUDGET=15.00
DEFAULT_MODEL=fast-model
BUDGET_ALERT_THRESHOLD=80
LOCAL_MODEL_PREFERENCE=true

---

## 18. GROWTH TRACKING

LEARNING=contract law basics, vector databases, LangGraph
MASTERED=Python, REST APIs, AWS fundamentals, SQL

---

## 19. MODEL LIST

MODEL_LIST=
  fast-model | GPT-4o Mini | 0.15 | research, summaries, drafts
  smart-model | GPT-4o | 2.50 | client output, complex reasoning
  local-general | Llama 3.1 8B (local) | 0.00 | status, logs, quick tasks
  local-code | DeepSeek Coder 6.7B (local) | 0.00 | code review, patches

---

## 20. ENVIRONMENT

INSTALL_PATH=/home/korvin/korvin
DASHBOARD_PORT=3002
GATEWAY_PORT=4000
ACTIVE_COMMANDS=/help,/status,/log,/scan,/patch,/grill,/brief,/confirm,/cancel,/pending
WHISPER_MODEL=tiny.en
TTS_VOICE=default
