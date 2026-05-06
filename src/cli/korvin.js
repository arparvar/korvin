#!/usr/bin/env node

const { runInit } = require('./commands/init');

function printHelp() {
  console.log(`KORVIN CLI

Usage:
  korvin <command>

Available commands:
  korvin init     Create a local KORVIN project configuration

More commands are planned.
`);
}

function printUnknownCommand(command) {
  console.error(`Unknown KORVIN command: ${command}

Available commands:
  korvin init     Create a local KORVIN project configuration

More commands are planned.
`);
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