const crypto = require('crypto');

const SPECIAL_TOKEN_PATTERN = /<\|[a-z_]+\|>|\[\/?INST\]|<<\/?SYS>>/g;
const EXTERNAL_MARKER_PATTERN = /EXTERNAL CONTENT (?:BEGIN|END)/i;

function stripSpecialTokens(text) {
  return String(text || '').replace(SPECIAL_TOKEN_PATTERN, '');
}

function makeBoundaryId() {
  return crypto.randomBytes(12).toString('hex');
}

function stripPrematureMarkerLines(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !EXTERNAL_MARKER_PATTERN.test(line))
    .join('\n');
}

function wrapExternalContent(content, sourceLabel) {
  const boundaryId = makeBoundaryId();
  const cleanContent = stripPrematureMarkerLines(stripSpecialTokens(content));
  const cleanSourceLabel = stripSpecialTokens(sourceLabel).replace(/\r?\n/g, ' ').trim();

  return [
    `[EXTERNAL CONTENT BEGIN | source: ${cleanSourceLabel} | id: ${boundaryId}]`,
    cleanContent,
    `[EXTERNAL CONTENT END | id: ${boundaryId}]`,
  ].join('\n');
}

module.exports = {
  wrapExternalContent,
  stripSpecialTokens,
};
