#!/usr/bin/env node

const { runInit } = require('./commands/init');
const { runDoctor } = require('./commands/doctor');
const packageJson = require('../../package.json');

function getHelpText() {
  return `KORVIN CLI

Usage:
  korvin <command>

Available commands:
  korvin init <folder>           Create or repair a local KORVIN setup
  korvin init <folder> --voice   Also prepare placeholder voice folders
  korvin doctor                  Check local environment and default setup folder
  korvin doctor <folder>         Check a specific local KORVIN setup folder

Examples:
  korvin init ./korvin-local
  korvin init ./korvin-local --voice
  korvin doctor
  korvin doctor ./korvin-local

Current boundaries:
  - Local setup files and checks only
  - No services installed
  - No public ports configured
  - No provider keys requested
  - No secrets read
  - No secrets written

Exit codes:
  0   Success
  1   Unknown command
  2   Invalid option or CLI failure
  3   Validation failed or repair recommended

More commands are planned.
`;
}

function printHelp() {
  console.log(getHelpText());
}

function printVersion() {
  console.log(packageJson.version);
}

function printUnknownCommand(command) {
  console.error(`Unknown KORVIN command: ${command}

${getHelpText()}`);
  process.exitCode = 1;
}

async function main(argv) {
  const command = argv[2];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    printVersion();
    return;
  }

  if (command === 'init') {
    await runInit(argv.slice(3));
    return;
  }

  if (command === 'doctor') {
    await runDoctor(argv.slice(3));
    return;
  }

  printUnknownCommand(command);
}

main(process.argv).catch((error) => {
  console.error('KORVIN CLI failed.');
  console.error(error && error.message ? error.message : error);
  process.exitCode = 2;
});
