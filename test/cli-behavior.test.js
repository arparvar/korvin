const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'src', 'cli', 'korvin.js');
const testOutputFolder = path.join(repoRoot, 'korvin-cli-test-output');

function runCli(args) {
  const result = childProcess.spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false
  });

  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}${result.stderr || ''}`
  };
}

function removeTestOutputFolder() {
  fs.rmSync(testOutputFolder, {
    recursive: true,
    force: true
  });
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(testOutputFolder, relativePath), 'utf8'));
}

function assertIncludes(output, expected) {
  assert(
    output.includes(expected),
    `Expected output to include: ${expected}\nActual output:\n${output}`
  );
}

removeTestOutputFolder();

try {
  const help = runCli(['--help']);
  assert.strictEqual(help.code, 0);
  assertIncludes(help.output, 'KORVIN CLI');
  assertIncludes(help.output, 'korvin init <folder>');
  assertIncludes(help.output, 'korvin doctor');

  const version = runCli(['--version']);
  assert.strictEqual(version.code, 0);
  assert.match(version.output.trim(), /^\d+\.\d+\.\d+$/);

  const initHelp = runCli(['init', '--help']);
  assert.strictEqual(initHelp.code, 0);
  assertIncludes(initHelp.output, 'KORVIN init');
  assertIncludes(initHelp.output, '--voice');
  assertIncludes(initHelp.output, '--yes');
  assertIncludes(initHelp.output, 'Exit codes:');

  const doctorHelp = runCli(['doctor', '--help']);
  assert.strictEqual(doctorHelp.code, 0);
  assertIncludes(doctorHelp.output, 'KORVIN doctor');
  assertIncludes(doctorHelp.output, 'Exit codes:');

  const unknownCommand = runCli(['not-a-command']);
  assert.strictEqual(unknownCommand.code, 1);
  assertIncludes(unknownCommand.output, 'Unknown KORVIN command');

  const invalidInitFlag = runCli(['init', '--bad-flag']);
  assert.strictEqual(invalidInitFlag.code, 2);
  assertIncludes(invalidInitFlag.output, 'Unknown option detected.');

  const invalidDoctorFlag = runCli(['doctor', '--bad-flag']);
  assert.strictEqual(invalidDoctorFlag.code, 2);
  assertIncludes(invalidDoctorFlag.output, 'Unknown option detected.');

  const missingDoctor = runCli(['doctor', testOutputFolder]);
  assert.strictEqual(missingDoctor.code, 3);
  assertIncludes(missingDoctor.output, 'Final status: Repair recommended');

  const init = runCli(['init', testOutputFolder, '--yes']);
  assert.strictEqual(init.code, 0);
  assertIncludes(init.output, 'Validation passed.');
  assertIncludes(init.output, 'Safe defaults accepted: true');
  assertIncludes(init.output, 'No public ports were configured.');

  const doctor = runCli(['doctor', testOutputFolder]);
  assert.strictEqual(doctor.code, 0);
  assertIncludes(doctor.output, 'Final status: Ready');
  assertIncludes(doctor.output, '.env read: false');

  const config = readJson('korvin.config.json');
  assert.strictEqual(config.dashboard.host, '127.0.0.1');
  assert.strictEqual(config.security.internetExposure, false);
  assert.strictEqual(config.security.publicPortsConfigured, false);
  assert.strictEqual(config.security.secretsWritten, false);

  assert.ok(fs.existsSync(path.join(testOutputFolder, '.env.example')));
  assert.ok(fs.existsSync(path.join(testOutputFolder, 'README.local.md')));
  assert.ok(fs.existsSync(path.join(testOutputFolder, 'docs', 'SETUP_SUMMARY.md')));
  assert.ok(!fs.existsSync(path.join(testOutputFolder, '.env')));

  console.log('CLI behavior tests passed.');
} finally {
  removeTestOutputFolder();
}