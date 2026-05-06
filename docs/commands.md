# KORVIN Commands

This page documents the public KORVIN command surfaces.

KORVIN currently has two command categories:

1. CLI commands run from a terminal after installing the npm package.
2. Runtime commands used inside active KORVIN interfaces such as Telegram or future agent channels.

Keep these categories separate. The npm CLI is local-only and does not install or manage VPS production services.

## CLI Commands

Install the public npm package globally:

```bash
npm install -g @nosistech/korvin@latest
```

Check the installed version:

```bash
korvin --version
```

Show CLI help:

```bash
korvin --help
```

## Available Commands

```text
korvin init <folder>           Create or repair a local KORVIN setup
korvin init <folder> --voice   Also prepare placeholder voice folders
korvin doctor                  Check local environment and default setup folder
korvin doctor <folder>         Check a specific local KORVIN setup folder
```

## korvin init

Create or repair a safe local-only KORVIN project configuration.

```bash
korvin init <folder>
```

Example:

```bash
korvin init ./korvin-local
```

What it does:

- Creates a local KORVIN setup folder
- Creates local setup files
- Creates local documentation files
- Detects environment information
- Preserves existing files
- Uses repair mode when files already exist
- Restores missing generated files only
- Keeps dashboard defaults local-only

Current boundaries:

- Quick Local Setup only
- No VPS setup
- No Cloudflare setup
- No Telegram setup
- No LiteLLM setup
- No dashboard service setup
- No systemd setup
- No public ports
- No provider keys requested
- No secrets read
- No secrets written

## korvin init --voice

Create or repair a local setup and also prepare placeholder voice folders.

```bash
korvin init <folder> --voice
```

Example:

```bash
korvin init ./korvin-local --voice
```

This prepares local placeholder voice structure only.

It does not install or configure production speech-to-text, text-to-speech, microphone handling, speakers, services, public networking, or model provider keys.

## korvin init --yes

Run local setup using safe defaults.

```bash
korvin init <folder> --yes
```

Example:

```bash
korvin init ./korvin-local --yes
```

`--yes` is useful for repeatable local setup and testing.

`--yes` does not bypass KORVIN safety boundaries. It still does not configure VPS services, Cloudflare, Telegram, LiteLLM runtime, dashboard services, systemd, provider keys, secrets, or public ports.

## korvin doctor

Check the local environment and default setup folder.

```bash
korvin doctor
```

Check a specific local KORVIN setup folder:

```bash
korvin doctor <folder>
```

Example:

```bash
korvin doctor ./korvin-local
```

`korvin doctor` checks local setup state without reading secrets or changing files.

Typical checks include:

- Platform
- Node.js
- npm
- Git
- Python
- KORVIN CLI/package version
- Target folder
- Setup markers
- Local-only dashboard configuration
- Internet exposure flag
- Public port configuration flag
- Secret-writing flag

A healthy setup shows:

```text
Final status: Ready
```

## Version Commands

Show the installed KORVIN CLI version:

```bash
korvin --version
korvin -v
korvin version
```

Example verified output:

```text
0.1.7
```

## Help Commands

Show main CLI help:

```bash
korvin --help
```

Show init help:

```bash
korvin init --help
```

## Exit Codes

KORVIN CLI commands use exit codes so users and scripts can detect success or failure.

| Exit code | Meaning |
|---:|---|
| 0 | Success |
| 1 | Unknown command |
| 2 | Invalid option or CLI failure |
| 3 | Validation failed or repair recommended |

## Runtime Commands

Runtime commands are separate from npm CLI commands.

The npm CLI is run in a terminal. Runtime commands are used inside active KORVIN interfaces such as Telegram or future agent channels.

Runtime commands may depend on deployment state, enabled services, and configured channels. They should not be documented as npm CLI commands.

Future versions of this page may document stable runtime commands after they are verified for public use.

## Troubleshooting

### `korvin` command not found

Install or update the package globally:

```bash
npm install -g @nosistech/korvin@latest
```

Then verify:

```bash
korvin --version
```

### Installed version is older than expected

Update the global package:

```bash
npm install -g @nosistech/korvin@latest
```

Then verify:

```bash
korvin --version
```

### A command option is rejected

Check help output:

```bash
korvin --help
korvin init --help
```

### Existing files were not overwritten

This is expected.

`korvin init` is designed to preserve existing files and repair missing generated files only.

### `.env` was not overwritten

This is expected and intentional.

KORVIN does not overwrite `.env`, read secrets, or print secrets during local setup.

## Public Documentation Rule

Only document what works today.

Do not claim that the npm CLI installs or manages production services unless that capability is implemented, tested, and released.

Do not claim direct fork lineage from OpenClaw or Hermes unless future evidence proves it.

Safe wording:

```text
KORVIN is influenced by prior agent and memory architectures.
```

Avoid:

```text
KORVIN is built by forking OpenClaw and Hermes.
```

