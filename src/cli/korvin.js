#!/usr/bin/env node

const { runInit } = require('./commands/init');

function getHelpText() {
  return `KORVIN CLI

Usage:
  korvin <command>

Available commands:
  korvin init <folder>           Create or repair a local KORVIN setup
  korvin init <folder> --voice   Also prepare placeholder voice folders

Examples:
  korvin init ./korvin-local
  korvin init ./korvin-local --voice

Current boundaries:
  - Local setup files only
  - No services installed
  - No public ports configured
  - No provider keys requested
  - No secrets written

More commands are planned.
`;
}

function printHelp() {
  console.log(getHelpText());
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

  if (command === 'init') {
    await runInit(argv.slice(3));
    return;
  }

  printUnknownCommand(command);
}

main(process.argv).catch((error) => {
  console.error('KORVIN CLI failed.');
  console.error(error && error.message ? error.message : error);
  process.exitCode = 2;
});