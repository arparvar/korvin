'use strict';

async function run(message, match) {
  return `Echo: ${match[1]}`;
}

module.exports = { run };
