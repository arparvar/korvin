'use strict';

const PERMISSION_LEVELS = {
  'read-only': 0,      // Read local state only, no network
  'network-read': 1,   // May make outbound HTTP GET requests
  'local-status': 2,   // May run fixed local status commands (df, free, systemctl is-active)
  'external-write': 3, // May write to external services (email send, calendar create) - NOT allowed for manifest skills
  'local-write': 4,    // May write local files - NOT allowed for manifest skills
  'shell': 5,          // May run arbitrary shell - NEVER allowed
};

function isPermissionAllowed(permission) {
  return ['read-only', 'network-read', 'local-status'].includes(permission);
}

function describePermission(permission) {
  const descriptions = {
    'read-only': 'Read local state only',
    'network-read': 'Outbound HTTP read requests',
    'local-status': 'Fixed local status commands',
    'external-write': 'External service writes (NOT allowed for operator skills)',
    'local-write': 'Local file writes (NOT allowed for operator skills)',
    'shell': 'Arbitrary shell execution (NEVER allowed)',
  };
  return descriptions[permission] || 'Unknown permission';
}

module.exports = { PERMISSION_LEVELS, isPermissionAllowed, describePermission };
