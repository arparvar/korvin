# KORVIN Init Developer Implementation Plan v0.1

Status: Planning artifact only. Not implemented yet.
Related UX spec: `docs/specs/korvin-init-ux-spec-v0.1.md`
Target repo file: `docs/specs/korvin-init-implementation-plan-v0.1.md`
Feature state: `korvin init` remains roadmap-only until implemented, tested, committed, and released.

## 1. Purpose

This document converts the `korvin init` UX specification into a developer implementation plan for v1.

The goal of v1 is narrow and deliberate:

Generate a safe local KORVIN project folder with placeholder configuration, local-only dashboard defaults, model-agnostic provider templates, memory folders, and clear next-step documents.

This plan is not code. It is the build plan for the first implementation.

## 2. v1 Scope

`korvin init` v1 supports one setup path only:

Quick Local Setup.

The user should be able to run:

```bash
korvin init
```

Then complete a short guided flow that creates a local project folder.

v1 must not configure production deployment, remote access, system services, or public networking.

## 3. v1 Includes

v1 includes:

* Environment detection
* Quick Local Setup only
* Local project folder generation
* `.env.example` generation
* `.gitignore` generation
* `korvin.config.json` generation
* Model provider example config
* LiteLLM example config
* Dashboard example config
* Basic memory folder preparation
* Local-only dashboard binding to `127.0.0.1`
* Optional voice folder preparation
* Clear next-step documentation
* Safe rerun detection
* Validation after file generation
* Actionable error messages

## 4. Explicit Non-Goals

These items must not be implemented in v1:

* VPS setup profile
* Low-power device setup profile
* Advanced custom setup profile
* Cloudflare Tunnel automation
* Cloudflare Access automation
* systemd service installation
* public port exposure
* Telegram setup
* provider key validation
* automatic API key collection
* automatic local model installation
* Open WebUI installation
* production hardening automation
* claims that KORVIN is turnkey for all users

v1 is local setup only.

## 5. Key Correction From the Draft

The implementation should not ask for or store real provider keys in v1.

Reason:

* It keeps the first version safer.
* It avoids accidental secret exposure in terminal logs or screenshots.
* It keeps the setup wizard useful even before a user has provider keys.
* It matches the product principle that secrets should not appear in generated docs or shared output.

v1 should generate placeholders only. Provider key entry can be handled later by a dedicated command such as:

```bash
korvin provider add
```

## 6. Recommended Source File Layout

Use a small CLI router so future commands can be added without redesigning the package entry point.

```text
src/
  cli/
    korvin.js
    commands/
      init.js
    lib/
      prompts.js
      files.js
      detect.js
      validate.js
```

For the first coding pass, the developer may keep helper logic inside `init.js` if necessary, but the public entry point should still be `korvin.js`.

Reason:

`korvin init`, `korvin doctor`, `korvin start`, and future commands should share one executable command name.

## 7. npm Package Entry Point

Update `package.json` only when the CLI implementation is ready.

Expected future `bin` field:

```json
{
  "bin": {
    "korvin": "src/cli/korvin.js"
  }
}
```

`src/cli/korvin.js` should dispatch based on the first argument.

Example behavior:

```bash
korvin init
```

Routes to:

```text
src/cli/commands/init.js
```

If a user runs an unsupported command:

```bash
korvin something-else
```

Show:

```text
Unknown KORVIN command: something-else

Available commands:
  korvin init     Create a local KORVIN project configuration

More commands are planned.
```

## 8. Dependency Policy

v1 should use Node.js built-in modules only unless a future decision explicitly approves a dependency.

Recommended built-ins:

* `fs`
* `path`
* `os`
* `readline/promises`
* `child_process`
* `process`

Avoid adding prompt libraries in v1.

Reason:

The current public npm package should stay lightweight and easy to audit. Adding dependencies should be a deliberate release decision, not an accidental implementation choice.

## 9. CLI Command Router

File:

```text
src/cli/korvin.js
```

Responsibilities:

* read command arguments
* route `init` to the init command
* show help for missing or unknown commands
* avoid doing setup logic directly

Pseudo-structure:

```javascript
#!/usr/bin/env node

async function main(argv) {
  const command = argv[2]

  if (!command || command === 'help' || command === '--help') {
    return printHelp()
  }

  if (command === 'init') {
    const { runInit } = await import('./commands/init.js')
    return runInit(argv.slice(3))
  }

  return printUnknownCommand(command)
}

main(process.argv).catch(handleFatalError)
```

## 10. Init Command Responsibilities

File:

```text
src/cli/commands/init.js
```

Main exported function:

```javascript
export async function runInit(args = [])
```

Responsibilities:

1. Print welcome screen.
2. Detect environment.
3. Ask the Quick Local Setup prompts.
4. Build setup state.
5. Show review screen.
6. Create folders.
7. Write files.
8. Validate generated project.
9. Print success message.
10. Exit cleanly.

## 11. Core Function Signatures

Use structured return values so future non-interactive mode and GUI setup can reuse the logic.

### `detectEnvironment(options)`

```javascript
async function detectEnvironment(options = {})
```

Returns:

```javascript
{
  platform: 'windows' | 'linux' | 'macos' | 'unknown',
  nodeVersion: string,
  npmVersion: string | null,
  gitVersion: string | null,
  pythonVersion: string | null,
  warnings: Array<{ code: string, message: string }>,
  errors: Array<{ code: string, message: string }>
}
```

Notes:

* Missing Python is a warning, not a blocker.
* Missing Git is a warning, not a blocker.
* Missing npm is a warning if running from source, but may matter for package use.
* Node version incompatibility can be an error after the repo defines the minimum supported version.

### `promptForProjectFolder(defaultFolder)`

```javascript
async function promptForProjectFolder(defaultFolder = './korvin')
```

Returns:

```javascript
{
  projectFolder: string,
  absoluteProjectFolder: string
}
```

Rules:

* Default is `./korvin`.
* Expand relative paths safely.
* Do not accept an empty path.
* If folder exists, call `detectExistingSetup()`.

### `detectExistingSetup(projectFolder)`

```javascript
async function detectExistingSetup(projectFolder)
```

Returns:

```javascript
{
  exists: boolean,
  looksLikeKorvinProject: boolean,
  hasConfig: boolean,
  hasEnv: boolean,
  hasGeneratedDocs: boolean
}
```

### `promptExistingSetupAction(existingSetup)`

```javascript
async function promptExistingSetupAction(existingSetup)
```

Returns one of:

```javascript
'exit' | 'repair-missing-files' | 'choose-different-folder'
```

v1 should not implement full reconfiguration. Repair missing files only.

### `promptForProvider()`

```javascript
async function promptForProvider()
```

Returns:

```javascript
{
  selected: boolean,
  providerType: 'openai-compatible' | 'deepseek' | 'gemini' | 'anthropic' | 'local-later' | null,
  keyHandling: 'manual-later'
}
```

Rules:

* Default is skip for now.
* Do not ask for the actual API key in v1.
* Generate instructions for manual `.env` setup later.

### `promptForMemory()`

```javascript
async function promptForMemory()
```

Returns:

```javascript
{
  enabled: true,
  mode: 'basic',
  path: 'memory'
}
```

v1 default is basic memory. No advanced memory prompt in v1.

### `promptForInterface()`

```javascript
async function promptForInterface()
```

Returns:

```javascript
{
  dashboard: true,
  telegram: false,
  voicePrepared: boolean
}
```

Rules:

* Dashboard only is the default.
* Telegram is not offered in v1 except as future note in documentation.
* Voice prep may be offered as an optional folder and config preparation only.

### `buildSetupState(answers, detection)`

```javascript
function buildSetupState(answers, detection)
```

Returns the setup state object described in Section 12.

### `generateProject(state)`

```javascript
async function generateProject(state)
```

Returns:

```javascript
{
  createdDirectories: string[],
  createdFiles: string[],
  skippedFiles: string[],
  warnings: string[]
}
```

### `validateProject(state)`

```javascript
async function validateProject(state)
```

Returns:

```javascript
{
  valid: boolean,
  missingFiles: string[],
  invalidFiles: string[],
  warnings: string[]
}
```

### `printSuccess(state, validation)`

```javascript
function printSuccess(state, validation)
```

Prints a truthful summary of what was created.

## 12. Setup State Object

The setup state is the single source of truth for generation.

```javascript
{
  schemaVersion: '0.1',
  featureState: 'planning-implementation',
  profile: 'quick-local',
  createdAt: '<ISO_8601_TIMESTAMP>',

  project: {
    folder: './korvin',
    absoluteFolder: '<LOCAL_ABSOLUTE_PATH_NOT_WRITTEN_TO_PUBLIC_DOCS>'
  },

  provider: {
    selected: false,
    providerType: null,
    keyHandling: 'manual-later',
    keyEnvVar: 'KORVIN_PROVIDER_KEY'
  },

  dashboard: {
    enabled: true,
    mode: 'local-only',
    host: '127.0.0.1',
    port: 3002
  },

  memory: {
    enabled: true,
    engine: 'sqlite',
    path: 'memory/korvin-memory.db'
  },

  interfaces: {
    dashboard: true,
    telegram: false,
    voicePrepared: false
  },

  security: {
    internetExposure: false,
    publicPortsConfigured: false,
    secretsWritten: false
  },

  warnings: []
}
```

Important:

The absolute local path can exist in runtime memory, but generated docs should use relative paths where possible.

## 13. Prompt Flow Order

v1 prompt flow:

1. Welcome screen
2. Environment detection summary
3. Project folder prompt
4. Existing setup prompt, only if needed
5. Provider selection prompt
6. Memory confirmation
7. Dashboard local-only confirmation
8. Optional voice preparation prompt
9. Review screen
10. Confirm generation
11. Generate files
12. Validate files
13. Success screen

Do not show VPS, low-power, or advanced setup as selectable v1 paths unless marked clearly as Coming soon.

Recommended v1 profile screen:

```text
Setup profile:

1. Quick Local Setup, recommended
2. VPS Setup, coming soon
3. Low-Power Device Setup, coming soon
4. Advanced Custom Setup, coming soon

Choose an option [1]:
```

If the user selects a Coming soon option:

```text
That setup profile is planned but not available in v1.
For now, KORVIN can create a safe local setup.

Continue with Quick Local Setup? [Y/n]:
```

## 14. Generated Folder Structure

For default v1 setup:

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

If voice preparation is enabled:

```text
korvin/
  voice/
    input/
      .gitkeep
    output/
      .gitkeep
    profiles/
      default.example.json
```

## 15. Generated File Templates

### `.env.example`

```dotenv
# KORVIN environment variables
# Copy this file to .env when you are ready to add local secrets.
# Do not commit .env to Git.

# Model provider key, optional until you configure a provider
KORVIN_PROVIDER_KEY=

# Dashboard local auth key, optional until local dashboard auth is enabled
KORVIN_DASHBOARD_KEY=

# LiteLLM key, optional until LiteLLM is configured
LITELLM_MASTER_KEY=
```

### `.gitignore`

```gitignore
.env
*.env
memory/*.db
memory/*.sqlite
logs/*
!logs/.gitkeep
backups/*
!backups/.gitkeep
voice/input/*
!voice/input/.gitkeep
voice/output/*
!voice/output/.gitkeep
```

### `korvin.config.json`

```json
{
  "schemaVersion": "0.1",
  "profile": "quick-local",
  "createdAt": "<ISO_8601_TIMESTAMP>",
  "dashboard": {
    "enabled": true,
    "mode": "local-only",
    "host": "127.0.0.1",
    "port": 3002
  },
  "memory": {
    "enabled": true,
    "engine": "sqlite",
    "path": "memory/korvin-memory.db"
  },
  "provider": {
    "configured": false,
    "type": null,
    "apiKeyEnv": "KORVIN_PROVIDER_KEY"
  },
  "interfaces": {
    "dashboard": true,
    "telegram": false,
    "voicePrepared": false
  },
  "security": {
    "internetExposure": false,
    "publicPortsConfigured": false,
    "secretsWritten": false
  }
}
```

### `config/providers.example.json`

```json
{
  "provider": "openai-compatible",
  "model": "your-model-name",
  "baseUrl": "https://api.example-provider.com/v1",
  "apiKeyEnv": "KORVIN_PROVIDER_KEY",
  "notes": "Replace these placeholders when you choose a provider. Do not place secrets in this example file."
}
```

### `config/litellm.example.yaml`

```yaml
# Example LiteLLM configuration for local KORVIN setup.
# Replace placeholders before use.
# Do not commit real provider keys.

model_list:
  - model_name: korvin-default
    litellm_params:
      model: openai/your-model-name
      api_key: os.environ/KORVIN_PROVIDER_KEY

litellm_settings:
  drop_params: true
```

### `config/dashboard.example.json`

```json
{
  "enabled": true,
  "host": "127.0.0.1",
  "port": 3002,
  "auth": {
    "enabled": false,
    "apiKeyEnv": "KORVIN_DASHBOARD_KEY"
  },
  "notes": "The dashboard is local-only by default. Do not bind it to 0.0.0.0 unless you understand the risk and protect access."
}
```

### `README.local.md`

Must include:

```text
This folder was generated by korvin init v1.

This is a local-only setup.
No services were installed.
No internet exposure was configured.
No secrets were written.
```

Required sections:

* What was created
* What was not configured
* How to add provider keys later
* How dashboard access works locally
* How memory is stored locally
* Safety notes
* Next steps

### `docs/NEXT_STEPS.md`

Must include tailored next steps:

* copy `.env.example` to `.env` when ready
* add provider key locally only
* review `korvin.config.json`
* keep dashboard local unless protected remote access is configured later
* read `docs/SECURITY_NOTES.md`

### `docs/SECURITY_NOTES.md`

Must include:

* do not commit `.env`
* do not paste secrets into chats or screenshots
* local-only dashboard default
* no public ports configured by v1
* Cloudflare Tunnel plus Access is future protected remote path, not automatic v1 behavior
* Open WebUI is optional and separate from KORVIN core

## 16. Validation Rules

After generation, validate:

1. Required folders exist.
2. Required files exist.
3. `korvin.config.json` parses as valid JSON.
4. Dashboard host is exactly `127.0.0.1`.
5. `security.internetExposure` is `false`.
6. `security.publicPortsConfigured` is `false`.
7. `.gitignore` includes `.env`.
8. Example files do not contain obvious secret-like strings.
9. Generated docs do not claim VPS, Cloudflare, Telegram, Open WebUI, or systemd setup was completed.
10. If voice was skipped, no voice folders are created.
11. If voice was selected, only placeholder voice folders and example config are created.

## 17. Error Handling

Error messages must be specific, calm, and actionable.

### Folder write failure

```text
KORVIN could not write to the selected folder.

Likely reason: this location is not writable by your current user.

Try this:
1. Choose a folder inside your user directory.
2. Close apps that may be locking the folder.
3. Run setup again.

No services were started.
No internet exposure was configured.
```

### Existing project found

```text
KORVIN found an existing setup in this folder.

Choose what to do:
1. Repair missing generated files
2. Choose a different folder
3. Exit without changes

Choose an option [1]:
```

### Missing dependency warning

```text
Python was not found.

KORVIN can still generate local setup files now.
You may need Python later for dashboard or voice features.

Continue with file generation? [Y/n]:
```

### Validation failure

```text
KORVIN created the folder, but validation found an issue.

Issue: <VALIDATION_MESSAGE>

No services were started.
Please review the generated files or run setup repair.
```

## 18. Safe Rerun Behavior

`korvin init` must be safe to run more than once.

Rules:

* Never overwrite `.env`.
* Never overwrite user-edited files without confirmation.
* Regenerate missing example files only during repair.
* Show which files will be created before repair.
* If `korvin.config.json` exists, preserve it unless the user explicitly confirms replacement.
* Repair mode should not change dashboard exposure.
* Repair mode should not create voice folders unless the user selects voice preparation.

v1 rerun options:

```text
1. Repair missing generated files
2. Choose a different folder
3. Exit without changes
```

Full reconfiguration is future work.

## 19. Exit Codes

Use predictable exit codes:

```text
0  success
1  user cancelled
2  unrecoverable setup error
3  validation failed
```

## 20. Acceptance Criteria

v1 is accepted when:

1. `korvin init` creates the default local folder successfully.
2. The generated structure matches Section 14.
3. The default dashboard host is `127.0.0.1`.
4. No generated config enables public access.
5. `.env.example` is generated, but `.env` is not created automatically.
6. No real secrets are requested or stored.
7. `korvin.config.json` is valid JSON.
8. `config/litellm.example.yaml` uses environment variable placeholders only.
9. `.gitignore` protects `.env`, memory databases, logs, backups, and voice input or output.
10. Skipping provider setup still produces useful next steps.
11. Skipping voice setup does not create voice folders.
12. Enabling voice preparation creates only placeholder folders and example config.
13. Running the command a second time detects the existing setup.
14. Repair mode never overwrites `.env`.
15. Validation fails if dashboard host is anything other than `127.0.0.1`.
16. Generated docs clearly state this is local-only v1 setup.
17. Generated docs do not claim VPS, systemd, Cloudflare, Telegram, or Open WebUI setup.
18. Unsupported commands show help without crashing.
19. The package can be packed and inspected with `npm pack --dry-run` before release.
20. No new production dependencies are added unless explicitly approved.

## 21. Manual Test Checklist

Before declaring v1 complete, test:

| Test                                     | Expected result                                |
| ---------------------------------------- | ---------------------------------------------- |
| Run `korvin init` with all defaults      | Local project folder is created                |
| Run `korvin init` and skip provider      | Setup completes with provider placeholder docs |
| Run `korvin init` and select voice prep  | Voice placeholder folders are created          |
| Run `korvin init` and skip voice prep    | No voice folders are created                   |
| Run `korvin init` twice                  | Existing setup is detected                     |
| Choose repair mode                       | Missing generated files are restored only      |
| Existing `.env` is present               | `.env` is not overwritten                      |
| Existing `korvin.config.json` is present | User is asked before replacement               |
| Python is missing                        | Warning appears, setup can continue            |
| Git is missing                           | Warning appears, setup can continue            |
| Folder is not writable                   | Clear error message appears                    |
| Generated JSON is parsed                 | JSON is valid                                  |
| Generated YAML is inspected              | Only placeholder env references are present    |
| `.gitignore` is inspected                | `.env` and local data are protected            |
| Dashboard config is inspected            | Host is `127.0.0.1`                            |
| Generated docs are inspected             | No future feature is claimed as completed      |
| `korvin unknown` is run                  | Help message appears                           |
| `npm pack --dry-run` is run              | Only intended files are included               |

## 22. Implementation Sequence

Recommended build order:

1. Add CLI router file.
2. Add init command file.
3. Add help output.
4. Add environment detection.
5. Add prompt utilities using Node built-ins.
6. Add setup state construction.
7. Add file and folder generation.
8. Add config template rendering.
9. Add validation.
10. Add safe rerun detection.
11. Add repair mode.
12. Add manual test pass.
13. Inspect package contents with `npm pack --dry-run`.
14. Commit implementation.
15. Test from a clean local folder.
16. Only then consider public README updates that say `korvin init` exists.

## 23. Future Expansion Notes

Future commands can build on the same setup state model:

```bash
korvin doctor
korvin provider add
korvin voice enable
korvin dashboard enable
korvin start
korvin backup
```

Future setup profiles:

* VPS Setup
* Local Low-Power Device Setup
* Advanced Custom Setup

Future capabilities:

* non-interactive setup flags
* JSON output mode
* provider key storage flow
* dashboard auth setup
* Cloudflare protected remote checklist generator
* systemd service generation
* local voice dependency checks
* Open WebUI optional integration guide

## 24. Release Wording Rule

Before implementation is complete and tested, public docs must say:

```text
korvin init is planned and documented, but not implemented yet.
```

After implementation is complete and tested, public docs may say:

```text
korvin init v1 creates a safe local-only KORVIN project configuration. VPS setup, Cloudflare setup, Telegram setup, and voice installation are future work.
```

Do not claim turnkey installation until the full install flow exists and has been tested.
