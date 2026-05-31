const SPECIAL_TOKEN_PATTERN = /<\|[a-z_]+\|>|\[\/?INST\]|<<\/?SYS>>/g;

function stripSpecialTokens(text) {
  return String(text || '').replace(SPECIAL_TOKEN_PATTERN, '');
}

function makeBoundaryId() {
  return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 8);
}

function stripPrematureEndLines(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !line.includes('EXTERNAL CONTENT END'))
    .join('\n');
}

function wrapExternalContent(content, sourceLabel) {
  const boundaryId = makeBoundaryId();
  const cleanContent = stripPrematureEndLines(stripSpecialTokens(content));
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
