const fs = require('fs/promises');
const path = require('path');
const childProcess = require('child_process');
const packageJson = require('../../../package.json');

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

function getDoctorHelpText() {
  return `KORVIN doctor

Usage:
  korvin doctor
  korvin doctor [folder]
  korvin doctor --help

Examples:
  korvin doctor
  korvin doctor ./korvin-local

What this command does:
  - Checks the local environment
  - Checks whether the target folder looks like a KORVIN local setup
  - Checks required generated files and folders
  - Checks local-only dashboard configuration
  - Checks internet exposure remains false
  - Checks public ports configured remains false
  - Checks secrets written remains false
  - Detects .env without reading it

Current boundaries:
  - Local checks only
  - No services installed
  - No internet exposure configured
  - No public ports configured
  - No provider keys requested
  - No secrets read
  - No secrets written
`;
}

function printDoctorHelp() {
  console.log(getDoctorHelpText());
}

function parseDoctorArgs(args = []) {
  const options = {
    projectFolder: './korvin-local',
    help: false,
    unknownFlags: []
  };

  const positional = [];

  for (const arg of args) {
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      options.help = true;
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

  if (!npmVersion) {
    warnings.push('npm was not found. npm is recommended for installing and updating the KORVIN CLI.');
  }

  if (!gitVersion) {
    warnings.push('Git was not found. Git is recommended for source control and future update workflows.');
  }

  if (!pythonVersion) {
    warnings.push('Python was not found. Python may be needed later for dashboard or voice features.');
  }

  return {
    platform: platformMap[process.platform] || 'unknown',
    nodeVersion: process.version,
    npmVersion,
    gitVersion,
    pythonVersion,
    korvinVersion: packageJson.version,
    warnings
  };
}

async function readJsonIfPresent(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return {
      exists: true,
      valid: true,
      value: JSON.parse(raw),
      error: null
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        exists: false,
        valid: false,
        value: null,
        error: 'missing'
      };
    }

    return {
      exists: true,
      valid: false,
      value: null,
      error: 'invalid-json'
    };
  }
}

async function inspectLocalSetup(projectFolder) {
  const absoluteProjectFolder = path.resolve(projectFolder);

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

  const setupMarkers = [
    'korvin.config.json',
    'README.local.md',
    '.env.example',
    'config/providers.example.json',
    'docs/SETUP_SUMMARY.md',
    'docs/SECURITY_NOTES.md'
  ];

  const foundMarkers = [];
  const missingFiles = [];
  const missingDirectories = [];
  const invalidConfig = [];
  const warnings = [];

  const folderExists = await pathExists(absoluteProjectFolder);

  for (const marker of setupMarkers) {
    if (await pathExists(path.join(absoluteProjectFolder, marker))) {
      foundMarkers.push(marker);
    }
  }

  for (const directory of requiredDirectories) {
    if (!(await pathExists(path.join(absoluteProjectFolder, directory)))) {
      missingDirectories.push(directory);
    }
  }

  for (const file of requiredFiles) {
    if (!(await pathExists(path.join(absoluteProjectFolder, file)))) {
      missingFiles.push(file);
    }
  }

  const configResult = await readJsonIfPresent(path.join(absoluteProjectFolder, 'korvin.config.json'));

  if (!configResult.exists) {
    invalidConfig.push('korvin.config.json is missing');
  } else if (!configResult.valid) {
    invalidConfig.push('korvin.config.json is not valid JSON');
  } else {
    const config = configResult.value;

    if (!config.dashboard || config.dashboard.host !== '127.0.0.1') {
      invalidConfig.push('dashboard.host must be 127.0.0.1');
    }

    if (!config.security || config.security.internetExposure !== false) {
      invalidConfig.push('security.internetExposure must be false');
    }

    if (!config.security || config.security.publicPortsConfigured !== false) {
      invalidConfig.push('security.publicPortsConfigured must be false');
    }

    if (!config.security || config.security.secretsWritten !== false) {
      invalidConfig.push('security.secretsWritten must be false');
    }
  }

  try {
    const gitignoreRaw = await fs.readFile(path.join(absoluteProjectFolder, '.gitignore'), 'utf8');

    if (!gitignoreRaw.includes('.env')) {
      invalidConfig.push('.gitignore must include .env');
    }
  } catch {
    invalidConfig.push('.gitignore is missing or unreadable');
  }

  const envExists = await pathExists(path.join(absoluteProjectFolder, '.env'));

  if (envExists) {
    warnings.push('.env exists locally. It was detected but not read.');
  }

  const looksLikeKorvinSetup = foundMarkers.length > 0;
  const valid =
    folderExists &&
    looksLikeKorvinSetup &&
    missingFiles.length === 0 &&
    missingDirectories.length === 0 &&
    invalidConfig.length === 0;

  return {
    projectFolder,
    absoluteProjectFolder,
    folderExists,
    looksLikeKorvinSetup,
    foundMarkers,
    missingFiles,
    missingDirectories,
    invalidConfig,
    warnings,
    envExists,
    valid
  };
}

function printEnvironment(detection) {
  console.log('Environment:');
  console.log(`- Platform: ${detection.platform}`);
  console.log(`- Node.js: ${detection.nodeVersion}`);
  console.log(`- npm: ${detection.npmVersion || 'not found'}`);
  console.log(`- Git: ${detection.gitVersion || 'not found'}`);
  console.log(`- Python: ${detection.pythonVersion || 'not found'}`);
  console.log(`- KORVIN CLI/package: ${detection.korvinVersion}`);
}

function printSetupInspection(inspection) {
  console.log('');
  console.log('Local setup inspection:');
  console.log(`- Target folder: ${inspection.projectFolder}`);
  console.log(`- Absolute folder: ${inspection.absoluteProjectFolder}`);
  console.log(`- Folder exists: ${inspection.folderExists}`);
  console.log(`- Looks like KORVIN setup: ${inspection.looksLikeKorvinSetup}`);
  console.log(`- .env exists: ${inspection.envExists}`);
  console.log('- .env read: false');

  console.log('');
  console.log('Safety checks:');

  if (inspection.invalidConfig.length === 0) {
    console.log('- Dashboard config local-only: true');
    console.log('- Internet exposure false: true');
    console.log('- Public ports configured false: true');
    console.log('- Secrets written false: true');
  } else {
    console.log('- One or more safety checks need attention.');
  }
}

function printList(title, items) {
  if (items.length === 0) {
    return;
  }

  console.log('');
  console.log(title);
  for (const item of items) {
    console.log(`- ${item}`);
  }
}

function printFinalStatus(environment, inspection) {
  const warnings = [
    ...environment.warnings,
    ...inspection.warnings
  ];

  printList('Warnings:', warnings);
  printList('Found setup markers:', inspection.foundMarkers);
  printList('Missing files:', inspection.missingFiles);
  printList('Missing directories:', inspection.missingDirectories);
  printList('Invalid configuration:', inspection.invalidConfig);

  console.log('');

  if (inspection.valid && warnings.length === 0) {
    console.log('Final status: Ready');
    process.exitCode = 0;
    return;
  }

  if (inspection.valid && warnings.length > 0) {
    console.log('Final status: Warnings found');
    process.exitCode = 0;
    return;
  }

  console.log('Final status: Repair recommended');
  console.log('');
  console.log('Recommended next step:');
  console.log(`korvin init ${inspection.projectFolder}`);
  process.exitCode = 3;
}

async function runDoctor(args = []) {
  const options = parseDoctorArgs(args);

  if (options.help) {
    printDoctorHelp();
    return;
  }

  if (options.unknownFlags.length > 0) {
    console.log('Unknown option detected.');
    for (const flag of options.unknownFlags) {
      console.log(`- ${flag}`);
    }
    console.log('');
    console.log('Supported options:');
    console.log('- --help');
    process.exitCode = 2;
    return;
  }

  console.log(`KORVIN doctor

This command checks a local KORVIN setup without reading secrets or changing files.

Current boundaries:
- Local checks only
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
`);

  const environment = await detectEnvironment();
  const inspection = await inspectLocalSetup(options.projectFolder);

  printEnvironment(environment);
  printSetupInspection(inspection);
  printFinalStatus(environment, inspection);
}

module.exports = {
  runDoctor
};
