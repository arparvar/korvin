'use strict';
const adapters = new Map();
function registerChannelAdapter(name, adapter) {
  adapters.set(name, adapter);
}
function getChannelAdapter(name) {
  return adapters.get(name);
}
function listChannelAdapters() {
  return Array.from(adapters.keys());
}
module.exports = { registerChannelAdapter, getChannelAdapter, listChannelAdapters };
