# KORVIN Quickstart

This guide helps you create and verify a safe local KORVIN setup folder.

KORVIN is an open-source, self-hosted AI agent framework for low-cost hardware.

Voice-first. Memory-persistent. Model-agnostic. No lock-in.

## What this quickstart does

This quickstart uses the experimental KORVIN CLI to create local setup files only.

It does not install services.
It does not configure a VPS.
It does not configure Cloudflare.
It does not configure Telegram.
It does not configure LiteLLM runtime.
It does not configure systemd.
It does not request provider keys.
It does not read secrets.
It does not write secrets.
It does not configure public ports.

## Requirements

Install these before starting:

- Node.js
- npm
- Git
- Python, recommended for future dashboard and voice work

Check your versions:

    node --version
    npm --version
    git --version
    python --version

## Install KORVIN CLI

Install the latest published package:

    npm install -g @nosistech/korvin@latest

Verify the CLI:

    korvin --version
    korvin --help

## Create a local setup folder

Create a safe local setup folder:

    korvin init ./korvin-local --yes

Optional voice preparation:

    korvin init ./korvin-local --voice --yes

The --yes flag uses safe defaults only.

It does not enable remote access.
It does not write secrets.
It does not configure public ports.

## Verify the setup

Run:

    korvin doctor ./korvin-local

A healthy setup should end with:

    Final status: Ready

If KORVIN reports missing files or folders, run:

    korvin init ./korvin-local --yes
    korvin doctor ./korvin-local

## What gets created

The local setup folder includes:

- .env.example
- .gitignore
- korvin.config.json
- README.local.md
- config/providers.example.json
- config/litellm.example.yaml
- config/dashboard.example.json
- docs/SETUP_SUMMARY.md
- docs/NEXT_STEPS.md
- docs/SECURITY_NOTES.md
- data/
- memory/
- logs/
- config/
- docs/
- backups/

If --voice is used, KORVIN also prepares placeholder voice folders and an example voice profile.

## Local safety defaults

The generated configuration uses these safe defaults:

- Dashboard host: 127.0.0.1
- Internet exposure: false
- Public ports configured: false
- Secrets written: false
- Provider configured: false

## Secrets

Do not paste secrets into chats, screenshots, issues, or public docs.

Do not commit .env.

Use .env only when you are ready to configure local secrets.

KORVIN doctor can detect whether .env exists, but it does not read it.

## Exit codes

KORVIN CLI uses these exit codes:

- 0: success
- 1: unknown command
- 2: invalid option or CLI failure
- 3: validation failed or repair recommended

## Recommended next commands

After setup:

    cd ./korvin-local

Then review:

- README.local.md
- docs/SETUP_SUMMARY.md
- docs/NEXT_STEPS.md
- docs/SECURITY_NOTES.md
- korvin.config.json

## Current boundary

This quickstart is for local onboarding only.

For protected remote access, read:

    docs/deployment.md

Do not expose raw dashboard ports directly to the public internet.
