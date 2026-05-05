/**
 * @nosistech/korvin
 * Self-hosted AI agent framework. Voice-first. Security-native.
 */
const { logActivity, getLogSummary } = require('./src/skills/activity-log');

module.exports = {
  logActivity,
  getLogSummary,
  version: require('./package.json').version
};
