# KORVIN Decision Log

This file records important KORVIN project decisions so future work stays aligned.

## Decision Format

Each decision should include:

- Date
- Decision
- Reason
- Status
- Follow-up, if any

## Decisions

### 2026-05-06: Keep KORVIN public positioning broad

Decision:
KORVIN should be positioned as an open-source, self-hosted AI agent framework for low-cost hardware.

Reason:
This keeps the project bigger than a personal assistant while preserving the original private operating-system use case.

Status:
Active.

Follow-up:
Keep README, npm metadata, docs, and landing page aligned with this positioning.

### 2026-05-06: Keep public CLI claims limited to tested behavior

Decision:
The public CLI should only claim local setup files, local checks, version output, and documented boundaries.

Reason:
KORVIN should not claim automated VPS setup, Cloudflare setup, Telegram setup, LiteLLM service setup, dashboard setup, systemd setup, provider-key setup, or public-port setup until those workflows are implemented and tested.

Status:
Active.

Follow-up:
Review README and docs before each release for overclaims.

### 2026-05-06: Use docs/README.md as the documentation entry point

Decision:
The docs folder should have its own index.

Reason:
As documentation grows, users need a clear path through quickstart, commands, configuration, deployment, positioning, and planning specs.

Status:
Active.

Follow-up:
Keep docs/README.md updated when new documentation files are added.
