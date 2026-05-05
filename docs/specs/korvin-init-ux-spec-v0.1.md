# KORVIN Init UX Specification v0.1

## Purpose

`korvin init` is the future onboarding command for setting up KORVIN without requiring the user to understand Linux services, environment files, model routing, memory storage, tunnels, or dashboard networking.

The command should guide the user step by step, explain every important choice in plain language, and generate a working local project structure that can later be deployed safely.

Important: `korvin init` is a roadmap feature. This document defines the intended experience. It does not claim the feature is already built.

## Product Positioning

KORVIN should present itself as:

Open-source, self-hosted AI agent framework for low-cost hardware. Voice-first. Memory-persistent. Model-agnostic. No lock-in.

The setup experience must reinforce that positioning by making the user feel:

* They own the system.
* They can choose their model provider.
* They can start simple and expand later.
* They do not need to expose anything publicly by default.
* Voice and memory are core design goals, even if the first setup path starts with text.

## Target User

The target user is non-technical or semi-technical.

They may know how to open a terminal, but they should not be expected to understand:

* systemd
* reverse proxies
* Cloudflare Tunnel internals
* environment variable conventions
* LiteLLM configuration
* firewall rules
* Linux file permissions
* npm package internals

The installer should explain only what is needed at each decision point.

## Primary UX Rule

The user should never feel trapped.

Every major prompt should offer:

1. A recommended default.
2. A plain-English explanation.
3. A safe escape path.
4. A way to continue later.

## Command Entry Point

The future command:

```bash
korvin init
```

Expected behavior:

1. Detect environment.
2. Explain what KORVIN will set up.
3. Ask a small number of setup questions.
4. Generate local configuration files.
5. Create the basic project folder structure.
6. Validate required tools.
7. Show next steps.
8. Avoid collecting or printing secrets directly into chat, logs, docs, or public files.

## First Screen

When the user runs `korvin init`, show:

```text
KORVIN Setup

Open-source, self-hosted AI agent framework.
Voice-first. Memory-persistent. Model-agnostic. No lock-in.

This setup will help you create a local KORVIN configuration.
You can start simple and add voice, dashboard, Telegram, or remote access later.

Recommended path: Local private setup.
Nothing will be exposed to the internet unless you choose that later.
```

Then show:

```text
What would you like to set up today?

1. Quick local setup, recommended
2. VPS setup
3. Local low-power device setup
4. Advanced custom setup
5. Exit

Choose an option [1]:
```

Default: `1`

## Setup Profiles

### 1. Quick Local Setup

Purpose:

Fastest safe start for a new user.

Includes:

* Local folder structure
* SQLite memory database path
* Local dashboard binding to `127.0.0.1`
* Provider configuration template
* LiteLLM routing template
* `.env.example`
* No public exposure
* No Cloudflare setup yet
* No systemd setup yet unless on Linux and user chooses it

Recommended for:

* First-time users
* Developers testing locally
* Windows or Linux users who want to understand KORVIN before deploying

### 2. VPS Setup

Purpose:

Prepare a server-oriented configuration.

Includes:

* Private service bindings
* systemd template files where supported
* Cloudflare Tunnel documentation pointer
* Cloudflare Access recommendation
* Firewall safety reminder
* No raw public port exposure by default

This path must not ask users to paste secrets into the terminal output that may later be shared.

### 3. Local Low-Power Device Setup

Purpose:

Prepare KORVIN for small machines such as mini PCs, older laptops, or low-cost Linux boxes.

Includes:

* lightweight defaults
* SQLite memory
* conservative logging
* optional local model placeholder
* optional remote provider routing
* dashboard disabled by default unless the user enables it

### 4. Advanced Custom Setup

Purpose:

For users who already understand model providers, dashboard access, voice, and deployment choices.

Includes:

* all prompts
* ability to skip components
* ability to generate config only
* ability to select provider routing strategy
* ability to prepare deployment templates

### 5. Exit

Show:

```text
No changes were made.
You can run `korvin init` again whenever you are ready.
```

## Environment Detection

Before asking too many questions, `korvin init` should detect:

* Operating system
* CPU architecture
* Node.js availability
* Python availability
* Git availability
* npm availability
* Whether the command is running inside an existing KORVIN folder
* Whether a `.env` or `korvin.config` file already exists
* Whether ports needed for local dashboard are already in use

Example output:

```text
Checking your system...

Operating system: Windows
Node.js: Found
Python: Found
Git: Found
KORVIN folder: Not found yet
Internet exposure: Not configured

Status: Ready for local setup
```

If a dependency is missing, do not fail aggressively. Show the issue and the next action.

Example:

```text
Python was not found.
KORVIN uses Python for the dashboard and some voice features.

You can still generate the project files now, but you will need Python before running the dashboard.

Continue anyway? [Y/n]:
```

## Project Folder Prompt

Prompt:

```text
Where should KORVIN create your project folder?

Default: ./korvin

Project folder path:
```

Default:

```text
./korvin
```

If folder exists:

```text
This folder already exists.

What would you like to do?

1. Use this folder and update missing files only
2. Create a new folder
3. Exit

Choose an option [1]:
```

Never overwrite user files without confirmation.

## Model Provider Prompt

KORVIN is model-agnostic. The setup should not push one provider as the identity of the product.

Prompt:

```text
Choose your first model provider.
You can change this later.

1. OpenAI-compatible provider
2. DeepSeek
3. Gemini
4. Anthropic
5. Local model later
6. Skip for now

Choose an option [6]:
```

Default: `6`

Reason:

A non-technical user may not have an API key yet. Setup should still succeed and produce a clear next step.

If provider is selected:

```text
KORVIN will create a placeholder for your provider key.
For safety, the key will not be shown in logs or documentation.

Do you want to add the key now? [y/N]:
```

Default: `N`

If yes:

* Use hidden input.
* Never echo the key.
* Never write it to public docs.
* Store only in local private environment file.
* Show a masked confirmation only.

Example:

```text
Provider key saved locally.
Key display: ****abcd
```

## Memory Prompt

Prompt:

```text
KORVIN can remember useful context between sessions.

Memory mode:

1. Basic memory, recommended
2. No memory for now
3. Advanced memory settings

Choose an option [1]:
```

Default: `1`

Basic memory should create:

* SQLite database path
* memory folder
* backup exclusion notes
* simple retention config placeholder

The installer should explain:

```text
Basic memory stores local context in your KORVIN folder.
You control the files. You can delete or back them up later.
```

## Interface Prompt

Prompt:

```text
How do you want to interact with KORVIN first?

1. Dashboard only, recommended for setup
2. Telegram bot
3. Voice interface later
4. Generate config only

Choose an option [1]:
```

Default: `1`

Rules:

* Telegram bot setup can be offered, but tokens must never be displayed back.
* Voice should be presented as a core direction but not forced during first setup.
* Dashboard should bind locally by default.

## Dashboard Access Prompt

Prompt:

```text
Dashboard access:

1. Local only, safest and recommended
2. Protected remote access, for VPS users
3. Disable dashboard for now

Choose an option [1]:
```

Default: `1`

If local only:

```text
KORVIN will bind the dashboard to 127.0.0.1.
This means only your machine can access it.
```

If protected remote access:

```text
KORVIN will prepare a safe remote-access checklist.
The recommended pattern is Cloudflare Tunnel plus Cloudflare Access.
KORVIN will not expose raw public ports by default.
```

The installer should generate a pointer to the deployment guide, not attempt unsafe public exposure.

## Voice Prompt

Prompt:

```text
Voice is part of KORVIN's direction.
Do you want to prepare voice folders and config now?

1. Yes, prepare voice config
2. Not now

Choose an option [2]:
```

Default: `2`

If yes, generate placeholders for:

* speech-to-text config
* text-to-speech config
* audio cache folder
* voice profile placeholder

Do not require Whisper or Kokoro to be installed during quick setup unless the selected profile requires it.

## Files and Folders Generated

For a basic local setup, create:

```text
korvin/
  .env.example
  .gitignore
  korvin.config.json
  README.local.md
  data/
    .gitkeep
  memory/
    .gitkeep
  logs/
    .gitkeep
  config/
    providers.example.json
    litellm.example.yaml
    dashboard.example.json
  docs/
    NEXT_STEPS.md
    SECURITY_NOTES.md
  backups/
    .gitkeep
```

If the user chooses voice preparation:

```text
  voice/
    input/
      .gitkeep
    output/
      .gitkeep
    profiles/
      default.example.json
```

If the user chooses Telegram:

```text
  config/
    telegram.example.json
```

If the user chooses VPS setup:

```text
  deploy/
    systemd/
      korvin.service.example
      korvin-dashboard.service.example
      litellm.service.example
    cloudflare/
      README.md
    firewall/
      README.md
```

## Generated Config Rules

Generated files must:

* Use placeholders for secrets.
* Avoid internal paths.
* Avoid public claims that unfinished features are built.
* Bind dashboard to `127.0.0.1` by default.
* Treat Open WebUI as optional and separate from KORVIN core.
* Keep provider configuration changeable.
* Avoid hardcoding a single model provider as the default identity.

## Success Message

For quick local setup:

```text
KORVIN setup files created successfully.

Project folder: ./korvin
Dashboard mode: Local only
Memory: Basic SQLite memory prepared
Model provider: Not configured yet
Internet exposure: Disabled

Next steps:
1. Open the project folder.
2. Add your model provider key when ready.
3. Start the local dashboard when dependencies are installed.

Nothing has been exposed to the internet.
```

For VPS setup:

```text
KORVIN VPS setup files created successfully.

Project folder: ./korvin
Dashboard mode: Private by default
Remote access: Cloudflare Tunnel plus Access recommended
Raw public ports: Not enabled by this setup
Model provider: Not configured yet

Next steps:
1. Review the generated deployment notes.
2. Configure provider keys locally on the server.
3. Enable services only after reviewing the security checklist.
```

## Error Message Principles

Errors should be specific, calm, and actionable.

Bad:

```text
Error: config failed.
```

Good:

```text
KORVIN could not create the memory folder.

Likely reason: the current user does not have permission to write here.

Try one of these:
1. Choose a folder inside your home directory.
2. Run the command from a different folder.
3. Check folder permissions.

No partial setup was activated.
```

## Recovery Paths

`korvin init` should support safe reruns.

If previous setup exists:

```text
KORVIN found an existing setup.

What would you like to do?

1. Check and repair missing files
2. Reconfigure provider settings
3. Reconfigure dashboard access
4. Create a backup before changing anything
5. Exit

Choose an option [1]:
```

The installer should never overwrite `.env` without explicit confirmation.

## Non-Goals for First Version

The first implementation of `korvin init` should not try to do everything.

### v1 Implementation Scope Note

The first implementation should present only the Quick Local Setup profile.

VPS setup, Local Low-Power Device setup, and Advanced Custom Setup are future profiles. They should either appear as `Coming soon` choices or stay hidden until those flows are specified and tested separately.

This prevents a developer from accidentally treating all planned setup profiles as required for v1.

Do not include in v1 unless separately implemented and tested:

* Full production hardening automation
* Self-patching claims
* Automatic public port exposure
* Automatic Cloudflare account setup
* Automatic Telegram bot creation through BotFather
* Automatic local model installation for every platform
* Open WebUI installation as core behavior
* Any claim that KORVIN is turnkey for all users

## Minimum Viable `korvin init`

The minimum useful version should do four things well:

1. Create safe project files.
2. Generate placeholder configuration.
3. Keep services private by default.
4. Give the user a clear next step.

If v1 only does those four things cleanly, it is still a strong foundation.

## Implementation Notes for Developers

The CLI should be designed so each step can run independently later:

* `detectEnvironment()`
* `chooseProfile()`
* `collectProviderSettings()`
* `collectMemorySettings()`
* `collectInterfaceSettings()`
* `generateFileTree()`
* `writeConfigFiles()`
* `validateSetup()`
* `printNextSteps()`

Each function should return structured results so the CLI can later support:

* non-interactive mode
* JSON output
* repair mode
* advanced install profiles
* GUI-based setup

## Future CLI Commands

Possible future commands:

```bash
korvin init
korvin doctor
korvin start
korvin stop
korvin status
korvin backup
korvin provider add
korvin dashboard enable
korvin voice enable
```

Only `korvin init` is covered by this specification.

## Open Questions

1. Should the first public `korvin init` target local setup only, then add VPS setup in v0.2?
2. Should provider keys be entered during setup or always added manually afterward?
3. Should the installer be Node-only, Python-assisted, or split by platform?
4. Should service templates be generated during init or handled by a separate deploy command?
5. Should Telegram setup be included in the first public version or kept as an advanced option?

## Recommended Next Decision

For momentum, the recommended next decision is:

Build `korvin init` v1 as a safe local configuration generator first.

That means:

* no public exposure
* no systemd automation by default
* no required API key at init time
* no forced Telegram setup
* no forced voice setup
* strong next-step documents

Then expand into VPS and full service installation after the local flow is clean.
