const readline = require('readline');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const os = require('os');

function getSetupHelpText() {
  return `KORVIN setup

Usage:
  korvin setup
  korvin setup --dir <folder>
  korvin setup --yes
  korvin setup --help

What this command does:
  - Detects your platform and prerequisites
  - Collects your LLM API key and dashboard password
  - Generates a .env file ready for deployment
  - Shows next steps for your platform

Options:
  --dir <folder>   Write .env to this folder (default: current directory)
  --yes            Skip optional prompts with safe defaults
  --help           Show this help text

Exit codes:
  0   Success or aborted by user
  2   Invalid option or setup failure
`;
}

function printSetupHelp() {
  console.log(getSetupHelpText());
}

function parseSetupArgs(args = []) {
  const options = {
    targetDir: process.cwd(),
    help: false,
    yes: false,
    unknownFlags: [],
    errors: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h' || arg === 'help') {
      options.help = true;
      continue;
    }

    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }

    if (arg === '--dir') {
      const value = args[index + 1];

      if (!value || value.startsWith('--')) {
        options.errors.push('--dir requires a folder value');
        continue;
      }

      options.targetDir = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      options.unknownFlags.push(arg);
      continue;
    }

    options.errors.push(`Unexpected argument: ${arg}`);
  }

  return options;
}

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

async function detectPrerequisites(platform) {
  const dockerVersion = await runCommand('docker', ['--version']);
  const bashVersion = process.platform === 'linux' || process.platform === 'darwin'
    ? await runCommand('bash', ['--version'])
    : null;
  const pythonVersion =
    (await runCommand('python3', ['--version'])) ||
    (await runCommand('python', ['--version']));

  return {
    platform,
    dockerVersion,
    bashVersion,
    pythonVersion
  };
}

function printPrerequisites(detection) {
  console.log('Prerequisite check:');
  console.log(`- Platform: ${detection.platform}`);
  console.log(`- Docker: ${detection.dockerVersion || 'not found'}`);

  if (process.platform === 'linux' || process.platform === 'darwin') {
    console.log(`- Bash: ${detection.bashVersion || 'not found'}`);
  }

  console.log(`- Python: ${detection.pythonVersion || 'not found'}`);

  if (process.platform === 'win32' && !detection.dockerVersion) {
    console.log('Docker Desktop is required on Windows. Download free from docker.com/products/docker-desktop');
  }
}

function readLine(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function readSecret(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const originalWriteToOutput = rl._writeToOutput;

    process.stdout.write(prompt);
    rl._writeToOutput = function muteOutput() {};

    rl.question('', (answer) => {
      rl._writeToOutput = originalWriteToOutput;
      process.stdout.write(os.EOL);
      rl.close();
      resolve(answer);
    });
  });
}

async function askForLlmKey() {
  console.log('Your AI model key. Korvin works with Gemini (free) or DeepSeek.');
  console.log('  Gemini free (no credit card): aistudio.google.com ? Get API key');
  console.log('  DeepSeek: platform.deepseek.com ? API keys');

  while (true) {
    const apiKey = (await readSecret('LLM API key: ')).trim();

    if (apiKey.length > 20) {
      const provider = apiKey.startsWith('AIza') ? 'gemini' : 'deepseek';
      console.log(`Provider detected: ${provider === 'gemini' ? 'Gemini' : 'DeepSeek'}`);
      return {
        apiKey,
        provider
      };
    }

    console.log('Error: API key must be more than 20 characters.');
  }
}

async function askForDashboardPassword() {
  console.log('Choose a login password for the Korvin dashboard (12+ characters):');

  while (true) {
    const password = await readSecret('Dashboard password: ');

    if (password.length >= 12) {
      return password;
    }

    console.log('Error: dashboard password must be at least 12 characters.');
  }
}

async function askForTelegramToken(options) {
  if (options.yes) {
    console.log('Telegram: skipped');
    return '';
  }

  console.log('Telegram bot token (optional ? press Enter to skip):');

  while (true) {
    const token = (await readLine('Telegram bot token: ')).trim();

    if (!token) {
      console.log('Telegram: skipped');
      return '';
    }

    if (token.includes(':') && token.length > 20) {
      console.log('Telegram: configured');
      return token;
    }

    console.log('Error: Telegram bot token must contain ":" and be more than 20 characters.');
  }
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function buildEnvContent(state) {
  const geminiKey = state.provider === 'gemini' ? state.apiKey : '';
  const deepseekKey = state.provider === 'deepseek' ? state.apiKey : '';
  const model = state.provider === 'gemini' ? 'gemini-flash' : 'deepseek-v4-pro';

  return `# Korvin environment ? generated by korvin setup
# Keep this file private. Never commit to git.

GEMINI_API_KEY=${geminiKey}
DEEPSEEK_API_KEY=${deepseekKey}
LITELLM_MASTER_KEY=${state.litellmKey}
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_BASE_URL=http://127.0.0.1:4000/v1
OPENAI_API_KEY=${state.litellmKey}
KORVIN_API_KEY=${state.dashboardPassword}
KORVIN_MODEL=${model}
TELEGRAM_BOT_TOKEN=${state.telegramToken}
KORVIN_CHAT_ID=
`;
}

function printWindowsNextSteps() {
  console.log('What to do next (Windows):');
  console.log('  1. Make sure Docker Desktop is running');
  console.log('  2. Copy litellm_config.docker.yaml to litellm_config.yaml in this folder');
  console.log('  3. Run: docker compose up -d');
  console.log('  4. Open: http://localhost:3002');
  console.log('  5. Log in with your dashboard key');
  console.log('  To also start the Telegram bot:');
  console.log('     docker compose --profile telegram up -d');
}

function printUnixNextSteps() {
  console.log('What to do next (Linux/macOS):');
  console.log('  1. Run: sudo bash install.sh');
  console.log('     (the installer will read your API key from environment or ask again)');
  console.log('  2. Open: http://YOUR_SERVER_IP:3002');
  console.log('  3. Log in with your dashboard key');
}

function printNextSteps(platform) {
  console.log('');

  if (platform === 'Windows') {
    printWindowsNextSteps();
    return;
  }

  if (platform === 'Linux' || platform === 'macOS') {
    printUnixNextSteps();
    return;
  }

  printWindowsNextSteps();
  console.log('');
  printUnixNextSteps();
}

function printSummary(state, envPath) {
  console.log('');
  console.log('Setup complete.');
  console.log(`  Provider: ${state.provider === 'gemini' ? 'Gemini' : 'DeepSeek'}`);
  console.log(`  Dashboard key: ${state.dashboardPassword}`);
  console.log(`  Telegram: ${state.telegramToken ? 'configured' : 'not configured'}`);
  console.log(`  .env written to: ${envPath}`);
}

async function writeEnvFile(state, targetDir) {
  const absoluteTargetDir = path.resolve(targetDir);
  const envPath = path.join(absoluteTargetDir, '.env');

  await fsp.mkdir(absoluteTargetDir, { recursive: true });

  if (await pathExists(envPath)) {
    const answer = (await readLine('Existing .env found. Overwrite? (y/N): ')).trim().toLowerCase();

    if (answer !== 'y') {
      console.log('Aborted. .env not changed.');
      return null;
    }
  }

  await fsp.writeFile(envPath, buildEnvContent(state), 'utf8');
  return envPath;
}

async function runSetup(args = []) {
  const options = parseSetupArgs(args);

  if (options.help) {
    printSetupHelp();
    return;
  }

  if (options.unknownFlags.length > 0 || options.errors.length > 0) {
    console.log('Invalid setup options detected.');

    for (const flag of options.unknownFlags) {
      console.log(`- Unknown option: ${flag}`);
    }

    for (const error of options.errors) {
      console.log(`- ${error}`);
    }

    console.log('');
    console.log('Supported options:');
    console.log('- --dir <folder>');
    console.log('- --yes');
    console.log('- --help');
    process.exitCode = 2;
    return;
  }

  const platform = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] || 'Unknown';

  console.log(`KORVIN setup

This guided setup writes a deployment-ready .env file for KORVIN.
`);

  const detection = await detectPrerequisites(platform);
  printPrerequisites(detection);

  console.log('');
  const llm = await askForLlmKey();
  console.log('');
  const dashboardPassword = await askForDashboardPassword();
  console.log('');
  const telegramToken = await askForTelegramToken(options);

  const litellmKey = crypto.randomBytes(32).toString('hex');
  console.log('Internal routing key: auto-generated');

  const state = {
    provider: llm.provider,
    apiKey: llm.apiKey,
    dashboardPassword,
    telegramToken,
    litellmKey
  };

  try {
    const envPath = await writeEnvFile(state, options.targetDir);

    if (!envPath) {
      return;
    }

    printSummary(state, envPath);
    printNextSteps(platform);
  } catch (error) {
    console.log('Setup failed.');
    console.log(error && error.message ? error.message : error);
    process.exitCode = 2;
  }
}

module.exports = {
  runSetup
};
