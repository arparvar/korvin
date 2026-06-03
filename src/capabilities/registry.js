'use strict';

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'data', 'capabilities.json');
const TMP_PATH = `${REGISTRY_PATH}.tmp`;
const UNREADABLE_WARNING = 'capabilities: registry unreadable, defaulting all to enabled';
let warnedUnreadable = false;

const DEFAULT_CAPABILITIES = [
  {
    id: 'example-echo',
    type: 'skill',
    label: 'Echo (example)',
    enabled: true,
    permission: 'read-only',
    service_unit: null,
    allowlist: [],
  },
  {
    id: 'research',
    type: 'skill',
    label: 'Web search',
    enabled: true,
    permission: 'network-read',
    service_unit: null,
    allowlist: ['lite.duckduckgo.com'],
  },
  {
    id: 'searxng',
    type: 'service',
    label: 'SearXNG (local search)',
    enabled: true,
    permission: null,
    service_unit: 'korvin-searxng.service',
    allowlist: null,
  },
  {
    id: 'egress-broker',
    type: 'service',
    label: 'Egress broker',
    enabled: true,
    permission: null,
    service_unit: 'korvin-egress-broker.service',
    allowlist: null,
  },
];

function readCapabilities() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (error) {
    if (!warnedUnreadable) {
      console.warn(UNREADABLE_WARNING);
      warnedUnreadable = true;
    }
    return DEFAULT_CAPABILITIES.map((entry) => ({
      ...entry,
      enabled: !(Array.isArray(entry.allowlist) && entry.allowlist.length > 0),
    }));
  }
}

function list() {
  return readCapabilities();
}

function get(id) {
  return readCapabilities().find((entry) => entry.id === id) || null;
}

function isEnabled(id) {
  const entry = get(id);
  return entry === null || entry.enabled === true;
}

function seedIfMissing() {
  if (fs.existsSync(REGISTRY_PATH)) {
    return false;
  }
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(TMP_PATH, `${JSON.stringify(DEFAULT_CAPABILITIES, null, 2)}\n`);
  fs.renameSync(TMP_PATH, REGISTRY_PATH);
  return true;
}

function setEnabled(id, bool) {
  const capabilities = readCapabilities();
  const entry = capabilities.find((item) => item.id === id);

  if (!entry) {
    return null;
  }

  entry.enabled = bool === true;
  fs.writeFileSync(TMP_PATH, `${JSON.stringify(capabilities, null, 2)}\n`);
  fs.renameSync(TMP_PATH, REGISTRY_PATH);
  return entry;
}

module.exports = { list, get, isEnabled, setEnabled, seedIfMissing, DEFAULT_CAPABILITIES };
