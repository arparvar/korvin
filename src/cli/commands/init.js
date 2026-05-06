const fs = require('fs/promises');
const path = require('path');
const childProcess = require('child_process');

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(command, args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', () => {
      resolve(null);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      resolve((stdout || stderr).trim());
    });
  });
}
function getInitHelpText() {
  return `KORVIN init

Usage:
  korvin init [folder]
  korvin init [folder] --voice
  korvin init --help

Examples:
  korvin init ./korvin-local
  korvin init ./korvin-local --voice

What this command does:
  - Creates or repairs a safe local-only KORVIN project folder
  - Generates example configuration files
  - Prepares memory, data, logs, backup, and docs folders
  - Preserves existing files during repair mode
  - Preserves .env if it already exists

Options:
  --voice   Also prepare placeholder voice folders and an example voice profile
  --help    Show this help text

Current boundaries:
  - Local setup files only
  - No services installed
  - No internet exposure configured
  - No public ports configured
  - No provider keys requested
  - No secrets written
`;
}

function printInitHelp() {
  console.log(getInitHelpText());
}

function parseInitArgs(args = []) {
  const options = {
    projectFolder: './korvin-local',
    voice: false,
    help: false,
    unknownFlags: []
  };

  const positional = [];

  for (const arg of args) {
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      options.help = true;
      continue;
    }

    if (arg === '--voice') {
      options.voice = true;
      continue;
    }

    if (arg.startsWith('--')) {
      options.unknownFlags.push(arg);
      continue;
    }

    positional.push(arg);
  }

  if (positional.length > 0) {
    options.projectFolder = positional[0];
  }

  return options;
}

async function detectEnvironment() {
  const platformMap = {
    win32: 'windows',
    linux: 'linux',
    darwin: 'macos'
  };

  const npmVersion = await runCommand('npm', ['--version']);
  const gitVersion = await runCommand('git', ['--version']);
  const pythonVersion = await runCommand('python', ['--version']);

  const warnings = [];

  if (!gitVersion) {
    warnings.push('Git was not found. KORVIN can still generate local setup files now.');
  }

  if (!pythonVersion) {
    warnings.push('Python was not found. You may need Python later for dashboard or voice features.');
  }

  return {
    platform: platformMap[process.platform] || 'unknown',
    nodeVersion: process.version,
    npmVersion,
    gitVersion,
    pythonVersion,
    warnings,
    errors: []
  };
}

function buildSetupState(projectFolder, detection, options) {
  const absoluteProjectFolder = path.resolve(projectFolder);
  const createdAt = new Date().toISOString();

  return {
    schemaVersion: '0.1',
    featureState: 'planning-implementation',
    profile: 'quick-local',
    createdAt,
    project: {
      folder: projectFolder,
      absoluteFolder: absoluteProjectFolder
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
      voicePrepared: options.voice
    },
    security: {
      internetExposure: false,
      publicPortsConfigured: false,
      secretsWritten: false
    },
    voice: {
      prepared: options.voice,
      profile: options.voice ? 'default' : null
    },
    environment: detection,
    warnings: detection.warnings,
    options
  };
}

function getTemplates(state) {
  const templates = {
    '.env.example': `# KORVIN environment variables
# Copy this file to .env when you are ready to add local secrets.
# Do not commit .env to Git.

# Model provider key, optional until you configure a provider
KORVIN_PROVIDER_KEY=

# Dashboard local auth key, optional until local dashboard auth is enabled
KORVIN_DASHBOARD_KEY=

# LiteLLM key, optional until LiteLLM is configured
LITELLM_MASTER_KEY=
`,
    '.gitignore': `.env
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
`,
    'korvin.config.json': `${JSON.stringify({
      schemaVersion: state.schemaVersion,
      profile: state.profile,
      createdAt: state.createdAt,
      dashboard: state.dashboard,
      memory: state.memory,
      provider: {
        configured: false,
        type: null,
        apiKeyEnv: 'KORVIN_PROVIDER_KEY'
      },
      interfaces: state.interfaces,
      security: state.security
    }, null, 2)}
`,
    'config/providers.example.json': `${JSON.stringify({
      provider: 'openai-compatible',
      model: 'your-model-name',
      baseUrl: 'https://api.example-provider.com/v1',
      apiKeyEnv: 'KORVIN_PROVIDER_KEY',
      notes: 'Replace these placeholders when you choose a provider. Do not place secrets in this example file.'
    }, null, 2)}
`,
    'config/litellm.example.yaml': `# Example LiteLLM configuration for local KORVIN setup.
# Replace placeholders before use.
# Do not commit real provider keys.

model_list:
  - model_name: korvin-default
    litellm_params:
      model: openai/your-model-name
      api_key: os.environ/KORVIN_PROVIDER_KEY

litellm_settings:
  drop_params: true
`,
    'config/dashboard.example.json': `${JSON.stringify({
      enabled: true,
      host: '127.0.0.1',
      port: 3002,
      auth: {
        enabled: false,
        apiKeyEnv: 'KORVIN_DASHBOARD_KEY'
      },
      notes: 'The dashboard is local-only by default. Do not bind it to 0.0.0.0 unless you understand the risk and protect access.'
    }, null, 2)}
`,
    'README.local.md': `# KORVIN Local Setup

This folder was generated by korvin init v1.

KORVIN is an open-source, self-hosted AI agent framework for low-cost hardware.
This generated folder is a safe local starting point for configuration, notes, memory files, logs, backups, and future runtime setup.

## What this folder is

This is a local-only KORVIN setup folder.

It gives you a clean place to review example configuration files before adding real provider keys, runtime services, internet access, or production deployment steps.

This folder is not a production deployment.
It is not connected to a VPS.
It does not expose anything to the public internet.

## Recommended first check

From the parent project folder, run:

\`\`\`powershell
korvin doctor .\\korvin-local
\`\`\`

Or, if you created a different folder:

\`\`\`powershell
korvin doctor <your-folder>
\`\`\`

KORVIN doctor checks the generated folder without reading secrets or changing files.

Expected healthy result:

\`\`\`text
Final status: Ready
\`\`\`

If files are missing, KORVIN doctor may show:

\`\`\`text
Final status: Repair recommended
\`\`\`

In that case, rerun korvin init against the same folder.

## Safety summary

- No services were installed.
- No internet exposure was configured.
- No public ports were configured.
- No provider keys were requested.
- No secrets were written.
- Existing files are preserved during repair mode.
- Existing .env files are preserved and are not read or modified.
- The dashboard example is local-only by default.

## What was created

- .env.example for local environment variable examples
- .gitignore to keep local secrets and generated files out of Git
- korvin.config.json for local setup state
- config/providers.example.json for model provider examples
- config/litellm.example.yaml for future LiteLLM routing examples
- config/dashboard.example.json for local dashboard examples
- data, memory, logs, config, docs, and backups folders
- docs/SETUP_SUMMARY.md
- docs/NEXT_STEPS.md
- docs/SECURITY_NOTES.md

## What was not configured

korvin init v1 does not configure:

- VPS setup
- Cloudflare setup
- Telegram setup
- LiteLLM runtime setup
- Dashboard service setup
- systemd services
- Open WebUI
- Provider keys
- Public ports
- Production deployment
- Voice runtime dependencies

## What to do next

1. Run korvin doctor against this folder.
2. Read docs/SETUP_SUMMARY.md.
3. Read docs/SECURITY_NOTES.md.
4. Read docs/NEXT_STEPS.md.
5. Review korvin.config.json.
6. Review the files inside config.
7. Copy .env.example to .env only when you are ready to add local secrets.
8. Keep .env private and local.

## What not to do

- Do not commit .env.
- Do not paste provider keys into chats, screenshots, issues, or public docs.
- Do not expose the dashboard to the public internet without protection.
- Do not treat this v1 local setup as a full production installer.
- Do not add real secrets to example files.
- Do not bind local dashboard examples to 0.0.0.0 unless you understand the risk and protect access.

## Where secrets go

Use .env for local secrets when you are ready.

The generated .env.example file is only a template. It is safe to inspect and commit.
The real .env file should stay private and should not be committed.

KORVIN doctor detects whether .env exists, but it does not read it.

## Optional voice preparation

If you ran korvin init with --voice, placeholder voice folders and an example voice profile were created.

Voice runtime dependencies are not installed by v1.
The voice folders are preparation only.

## Repair mode

If you run korvin init again in the same folder, KORVIN checks for missing generated files and restores what is missing.

Existing files are preserved.
Existing .env files are preserved.
After repair, run korvin doctor again.
`,
    'docs/SETUP_SUMMARY.md': `# KORVIN Setup Summary

This file records what korvin init v1 generated.

## Setup type

- Profile: quick-local
- Scope: local setup files only
- Internet exposure configured: no
- Public ports configured: no
- Services installed: no
- Provider keys requested: no
- Secrets written: no
- Secrets read: no

## Generated files

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

## Generated folders

- data
- memory
- logs
- config
- docs
- backups

## Local safety defaults

- Dashboard host: 127.0.0.1
- Internet exposure: false
- Public ports configured: false
- Secrets written: false
- Provider configured: false

## Verification command

Run this from the parent project folder:

\`\`\`powershell
korvin doctor <folder>
\`\`\`

A healthy setup should return:

\`\`\`text
Final status: Ready
\`\`\`

If doctor reports missing files or folders, rerun korvin init against the same folder.

## Safety notes

- .env.example is only a template.
- .env is where local secrets go when the user is ready.
- .env should not be committed.
- Existing files are preserved during repair mode.
- Existing .env files are preserved and are not read or modified.
- KORVIN doctor may detect .env, but it does not read it.

## Not configured by v1

- VPS setup
- Cloudflare setup
- Telegram setup
- LiteLLM runtime setup
- Dashboard service setup
- systemd services
- Open WebUI
- Provider keys
- Public ports
- Production deployment
- Voice runtime dependencies
`,
    'docs/NEXT_STEPS.md': `# KORVIN Next Steps

## 1. Verify the folder

Run:

\`\`\`powershell
korvin doctor <folder>
\`\`\`

Expected healthy result:

\`\`\`text
Final status: Ready
\`\`\`

## 2. Review the generated files

Read these files first:

1. README.local.md
2. docs/SETUP_SUMMARY.md
3. docs/SECURITY_NOTES.md
4. korvin.config.json

## 3. Review configuration examples

Open:

- config/providers.example.json
- config/litellm.example.yaml
- config/dashboard.example.json

These are examples only.
Do not put real secrets into example files.

## 4. Create .env only when ready

When you are ready to add local secrets, copy:

\`\`\`text
.env.example
\`\`\`

to:

\`\`\`text
.env
\`\`\`

Keep .env private.
Do not commit it.
Do not paste it into chats, issues, screenshots, or public docs.

## 5. Keep the setup local

KORVIN init v1 created local setup files only.

Before any future remote access or service setup, confirm:

- dashboard host stays 127.0.0.1 unless protected
- internet exposure stays false
- public ports configured stays false
- secrets written stays false

## 6. Repair if needed

If KORVIN doctor reports missing generated files, rerun:

\`\`\`powershell
korvin init <folder>
\`\`\`

Then run doctor again.
`,
    'docs/SECURITY_NOTES.md': `# KORVIN Security Notes

## Local-only by default

KORVIN init v1 creates local setup files only.

It does not install services.
It does not configure internet exposure.
It does not configure public ports.
It does not request provider keys.
It does not read secrets.
It does not write secrets.

## Secrets

- Do not commit .env.
- Do not paste secrets into chats, screenshots, issues, or public docs.
- Do not place real provider keys in example files.
- Use .env only when you are ready to configure local secrets.
- KORVIN doctor can detect that .env exists, but it does not read it.

## Dashboard safety

The dashboard example is local-only by default:

\`\`\`text
127.0.0.1
\`\`\`

Do not bind dashboard examples to:

\`\`\`text
0.0.0.0
\`\`\`

unless you understand the risk and protect access.

## Remote access

Cloudflare Tunnel plus Cloudflare Access is a future protected remote path.
It is not automatic v1 behavior.

Do not expose raw dashboard ports directly to the public internet.

## Optional components

Open WebUI is optional and separate from KORVIN core.
Telegram setup is not configured by v1.
LiteLLM runtime setup is not configured by v1.
Voice runtime dependencies are not installed by v1.

## Verification

Run:

\`\`\`powershell
korvin doctor <folder>
\`\`\`

A healthy local setup should return:

\`\`\`text
Final status: Ready
\`\`\`
`
  };

  if (state.options.voice) {
    templates['voice/profiles/default.example.json'] = `${JSON.stringify({
      profile: 'default',
      input: {
        engine: 'placeholder',
        notes: 'Future speech-to-text configuration goes here.'
      },
      output: {
        engine: 'placeholder',
        notes: 'Future text-to-speech configuration goes here.'
      },
      safety: {
        localOnly: true,
        secretsWritten: false
      }
    }, null, 2)}
`;
  }

  return templates;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectExistingSetup(baseFolder) {
  const markers = [
    'korvin.config.json',
    'README.local.md',
    '.env.example',
    'config/providers.example.json',
    'docs/SETUP_SUMMARY.md',
    'docs/SECURITY_NOTES.md'
  ];

  const foundMarkers = [];

  for (const marker of markers) {
    if (await pathExists(path.join(baseFolder, marker))) {
      foundMarkers.push(marker);
    }
  }

  return {
    exists: foundMarkers.length > 0,
    foundMarkers
  };
}

async function writeFileIfMissing(baseFolder, relativeFile, content, result) {
  const target = path.join(baseFolder, relativeFile);

  if (await pathExists(target)) {
    result.skippedFiles.push(relativeFile);
    return;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  result.createdFiles.push(relativeFile);
}

async function ensureDirectory(baseFolder, relativeDirectory, result) {
  const target = path.join(baseFolder, relativeDirectory);
  const existed = await pathExists(target);

  await fs.mkdir(target, { recursive: true });

  if (existed) {
    result.skippedDirectories.push(relativeDirectory);
  } else {
    result.createdDirectories.push(relativeDirectory);
  }
}

async function generateProject(state, existingSetup) {
  const result = {
    mode: existingSetup.exists ? 'repair-existing' : 'create-new',
    createdDirectories: [],
    skippedDirectories: [],
    createdFiles: [],
    skippedFiles: [],
    warnings: []
  };

  const baseFolder = state.project.absoluteFolder;

  const directories = [
    '.',
    'data',
    'memory',
    'logs',
    'config',
    'docs',
    'backups'
  ];

  if (state.options.voice) {
    directories.push('voice', 'voice/input', 'voice/output', 'voice/profiles');
  }

  for (const directory of directories) {
    await ensureDirectory(baseFolder, directory, result);
  }

  const gitkeepFiles = [
    'data/.gitkeep',
    'memory/.gitkeep',
    'logs/.gitkeep',
    'backups/.gitkeep'
  ];

  if (state.options.voice) {
    gitkeepFiles.push('voice/input/.gitkeep', 'voice/output/.gitkeep');
  }

  for (const file of gitkeepFiles) {
    await writeFileIfMissing(baseFolder, file, '', result);
  }

  const templates = getTemplates(state);

  for (const [relativeFile, content] of Object.entries(templates)) {
    await writeFileIfMissing(baseFolder, relativeFile, content, result);
  }

  return result;
}

async function validateProject(state) {
  const baseFolder = state.project.absoluteFolder;
  const requiredFiles = [
    '.env.example',
    '.gitignore',
    'korvin.config.json',
    'README.local.md',
    'config/providers.example.json',
    'config/litellm.example.yaml',
    'config/dashboard.example.json',
    'docs/SETUP_SUMMARY.md',
    'docs/NEXT_STEPS.md',
    'docs/SECURITY_NOTES.md'
  ];

  const requiredDirectories = [
    'data',
    'memory',
    'logs',
    'config',
    'docs',
    'backups'
  ];

  if (state.options.voice) {
    requiredFiles.push('voice/profiles/default.example.json');
    requiredDirectories.push('voice', 'voice/input', 'voice/output', 'voice/profiles');
  }

  const missingFiles = [];
  const missingDirectories = [];
  const invalidFiles = [];
  const warnings = [];

  for (const directory of requiredDirectories) {
    if (!(await pathExists(path.join(baseFolder, directory)))) {
      missingDirectories.push(directory);
    }
  }

  for (const file of requiredFiles) {
    if (!(await pathExists(path.join(baseFolder, file)))) {
      missingFiles.push(file);
    }
  }

  try {
    const configRaw = await fs.readFile(path.join(baseFolder, 'korvin.config.json'), 'utf8');
    const config = JSON.parse(configRaw);

    if (config.dashboard.host !== '127.0.0.1') {
      invalidFiles.push('korvin.config.json dashboard.host must be 127.0.0.1');
    }

    if (config.security.internetExposure !== false) {
      invalidFiles.push('korvin.config.json security.internetExposure must be false');
    }

    if (config.security.publicPortsConfigured !== false) {
      invalidFiles.push('korvin.config.json security.publicPortsConfigured must be false');
    }

    if (config.security.secretsWritten !== false) {
      invalidFiles.push('korvin.config.json security.secretsWritten must be false');
    }
  } catch {
    invalidFiles.push('korvin.config.json is not valid JSON');
  }

  try {
    const gitignoreRaw = await fs.readFile(path.join(baseFolder, '.gitignore'), 'utf8');

    if (!gitignoreRaw.includes('.env')) {
      invalidFiles.push('.gitignore must include .env');
    }
  } catch {
    invalidFiles.push('.gitignore is missing or unreadable');
  }

  if (await pathExists(path.join(baseFolder, '.env'))) {
    warnings.push('.env exists locally. It was preserved and was not read or modified.');
  }

  return {
    valid: missingFiles.length === 0 && missingDirectories.length === 0 && invalidFiles.length === 0,
    missingFiles,
    missingDirectories,
    invalidFiles,
    warnings
  };
}

function printEnvironment(detection) {
  console.log('Environment detection:');
  console.log(`- Platform: ${detection.platform}`);
  console.log(`- Node.js: ${detection.nodeVersion}`);
  console.log(`- npm: ${detection.npmVersion || 'not found'}`);
  console.log(`- Git: ${detection.gitVersion || 'not found'}`);
  console.log(`- Python: ${detection.pythonVersion || 'not found'}`);

  if (detection.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const warning of detection.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printExistingSetup(existingSetup) {
  if (!existingSetup.exists) {
    return;
  }

  console.log('');
  console.log('Existing KORVIN setup detected.');
  console.log('Repair mode is active.');
  console.log('');
  console.log('Repair behavior:');
  console.log('- Missing generated files will be restored.');
  console.log('- Existing files will be preserved.');
  console.log('- .env will never be overwritten.');
  console.log('- korvin.config.json will be preserved if it already exists.');
  console.log('- Dashboard safety remains local-only.');
  console.log('');
  console.log('Detected markers:');
  for (const marker of existingSetup.foundMarkers) {
    console.log(`- ${marker}`);
  }
}

function printSuccess(state, generation, validation) {
  console.log('');
  if (generation.mode === 'repair-existing') {
    console.log('KORVIN local setup checked and repaired.');
  } else {
    console.log('KORVIN local setup files created.');
  }

  console.log('');
  console.log(`Project folder: ${state.project.folder}`);
  console.log('');
  console.log(`Created directories: ${generation.createdDirectories.length}`);
  console.log(`Skipped existing directories: ${generation.skippedDirectories.length}`);
  console.log(`Created files: ${generation.createdFiles.length}`);
  console.log(`Skipped existing files: ${generation.skippedFiles.length}`);

  if (state.options.voice) {
    console.log('');
    console.log('Voice preparation: enabled');
    console.log('- Placeholder voice folders prepared.');
    console.log('- Example voice profile prepared.');
    console.log('- Voice runtime dependencies were not installed.');
  }

  console.log('');
  console.log('Safety summary:');
  console.log('- No services were installed.');
  console.log('- No internet exposure was configured.');
  console.log('- No public ports were configured.');
  console.log('- No provider keys were requested.');
  console.log('- No secrets were written.');
  console.log('- Dashboard default is 127.0.0.1.');
  console.log('- Existing user files were not overwritten.');
  console.log('');

  if (validation.warnings.length > 0) {
    console.log('Validation warnings:');
    for (const warning of validation.warnings) {
      console.log(`- ${warning}`);
    }
    console.log('');
  }

  if (!validation.valid) {
    console.log('Validation failed.');
    console.log('');

    if (validation.missingDirectories.length > 0) {
      console.log('Missing directories:');
      for (const directory of validation.missingDirectories) {
        console.log(`- ${directory}`);
      }
    }

    if (validation.missingFiles.length > 0) {
      console.log('Missing files:');
      for (const file of validation.missingFiles) {
        console.log(`- ${file}`);
      }
    }

    if (validation.invalidFiles.length > 0) {
      console.log('Invalid files:');
      for (const file of validation.invalidFiles) {
        console.log(`- ${file}`);
      }
    }

    process.exitCode = 3;
    return;
  }

  console.log('Validation passed.');
  console.log('');
  console.log('Next step:');
  console.log(`korvin doctor ${state.project.folder}`);
  console.log(`cd ${state.project.folder}`);
  console.log('Review README.local.md and docs/SETUP_SUMMARY.md');
}

async function runInit(args = []) {
  const options = parseInitArgs(args);

  if (options.help) {
    printInitHelp();
    return;
  }

  if (options.unknownFlags.length > 0) {
    console.log('Unknown option detected.');
    for (const flag of options.unknownFlags) {
      console.log(`- ${flag}`);
    }
    console.log('');
    console.log('Supported options:');
    console.log('- --voice');
    console.log('- --help');
    process.exitCode = 2;
    return;
  }

  console.log(`KORVIN init v1

This command creates or repairs a safe local-only KORVIN project configuration.

Current v1 boundaries:
- Quick Local Setup only
- Repair mode restores missing generated files only
- Existing files are preserved
- No VPS setup
- No Cloudflare setup
- No Telegram setup
- No systemd setup
- No public ports
- No provider keys requested
- No secrets written
`);

  const detection = await detectEnvironment();
  printEnvironment(detection);

  const state = buildSetupState(options.projectFolder, detection, options);
  const existingSetup = await detectExistingSetup(state.project.absoluteFolder);

  printExistingSetup(existingSetup);

  console.log('');
  console.log('Setup review:');
  console.log(`- Profile: ${state.profile}`);
  console.log(`- Project folder: ${state.project.folder}`);
  console.log(`- Dashboard host: ${state.dashboard.host}`);
  console.log(`- Voice preparation: ${state.options.voice}`);
  console.log('- Internet exposure: false');
  console.log('- Public ports configured: false');
  console.log('- Secrets written: false');

  const generation = await generateProject(state, existingSetup);
  const validation = await validateProject(state);

  printSuccess(state, generation, validation);
}

module.exports = {
  runInit
};
