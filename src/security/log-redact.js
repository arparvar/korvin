'use strict';

const { redactForLog } = require('./redaction');

let installed = false;

function installLogRedaction() {
  if (installed) return;
  installed = true;

  ['error', 'warn', 'log'].forEach((method) => {
    const original = console[method];
    console[method] = function redactedConsoleMethod(...args) {
      return original.apply(console, args.map(redactForLog));
    };
  });
}

module.exports = { installLogRedaction };
