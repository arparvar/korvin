# KORVIN Init Local Validation Plan v0.1

Status: Planning artifact only.  

Related UX spec: `docs/specs/korvin-init-ux-spec-v0.1.md`  

Related implementation plan: `docs/specs/korvin-init-implementation-plan-v0.1.md`  

Feature boundary: `korvin init` v1 is experimental local-only setup.

## 1. Purpose

This document defines the validation gate for `korvin init` v1 before any future release.

The goal is to prove that `korvin init` safely creates a local KORVIN project folder without crossing into production deployment, secret collection, public networking, Cloudflare automation, Telegram automation, systemd installation, LiteLLM runtime setup, dashboard runtime setup, or provider-key handling.

This document is not implementation code. It is the local validation plan for the implementation phase.

## 2. Validation Philosophy

`korvin init` v1 should be treated as successful only if it does less than a full installer.

The command should generate a safe local project scaffold, explain next steps, and preserve the user's ability to continue later.

The safest result is:

- no secrets collected
- no secrets printed
- no services installed
- no system services modified
- no public ports opened
- no provider keys requested
- no Cloudflare configuration attempted
- no Telegram bot setup attempted
- no production claims made
- no existing user files overwritten

## 3. Validation Scope

This plan validates:

- command behavior
- generated folder structure
- generated file contents
- safe rerun behavior
- repair behavior
- local-only defaults
- warning messages
- error messages
- README and npm claim boundaries
- package contents before release

This plan does not validate:

- VPS deployment
- Cloudflare Tunnel
- Cloudflare Access
- systemd services
- Telegram bot runtime
- LiteLLM runtime
- Open WebUI runtime
- public dashboard access
- provider API connectivity
- local voice runtime
- production hardening

## 4. Required Test Environments

Minimum validation should run on:

1. Windows PowerShell
2. Linux shell
3. Clean temporary folder
4. Existing folder with no KORVIN files
5. Existing KORVIN-generated folder
6. Existing folder with user-created files

Optional later validation:

1. macOS terminal
2. low-power Linux device
3. CI workflow using temporary folders

## 5. Pre-Test Repo Checks

Before running behavior tests, confirm the repo is clean.

```bash

git status

npm test

npm pack --dry-run

