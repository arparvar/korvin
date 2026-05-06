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

This is a local-only setup.
No services were installed.
No internet exposure was configured.
No secrets were written.

## What was created

- Placeholder environment file
- Local-only dashboard configuration
- Model provider example configuration
- LiteLLM example configuration
- Memory, data, logs, and backup folders
- Safety notes and next steps

## What was not configured

- VPS setup
- Cloudflare setup
- Telegram setup
- systemd services
- Open WebUI
- Provider keys
- Public ports

## Optional voice preparation

If you ran korvin init with --voice, placeholder voice folders and an example voice profile were created.
Voice runtime dependencies are not installed by v1.

## Next step

Copy .env.example to .env only when you are ready to add local secrets.
`,
    'docs/NEXT_STEPS.md': `# KORVIN Next Steps

1. Review korvin.config.json.
2. Copy .env.example to .env when you are ready to add local secrets.
3. Add provider keys locally only.
4. Keep the dashboard local unless protected remote access is configured later.
5. Read docs/SECURITY_NOTES.md.

KORVIN init v1 created local setup files only.
`,
    'docs/SECURITY_NOTES.md': `# KORVIN Security Notes

- Do not commit .env.
- Do not paste secrets into chats or screenshots.
- The dashboard is local-only by default.
- No public ports were configured by v1.
- Cloudflare Tunnel plus Access is a future protected remote path, not automatic v1 behavior.
- Open WebUI is optional and separate from KORVIN core.
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
  console.log(`cd ${state.project.folder}`);
  console.log('Review README.local.md and docs/SECURITY_NOTES.md');
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
  console.log('- Secrets written: false');

  const generation = await generateProject(state, existingSetup);
  const validation = await validateProject(state);

  printSuccess(state, generation, validation);
}

module.exports = {
  runInit
};