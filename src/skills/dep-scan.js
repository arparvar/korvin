'use strict';
// SECURITY INVARIANT: dep-scan reads manifest files only. Never invoke npm, pip, or package managers.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
function depScan() {
  const out = ['Dependency Scan (metadata only)', ''];
  const nodeUnpinned = [];
  const pkgPath = path.join(ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const entries = Object.entries(deps);
      out.push(`Node.js (${entries.length} packages):`);
      for (const [name, version] of entries) {
        const flag = String(version).includes('*') || String(version).startsWith('file:');
        out.push(`  ${name}: ${version}`);
        if (flag) nodeUnpinned.push(`${name}: ${version} (unpinned)`);
      }
      if (nodeUnpinned.length) out.push(`Unpinned: ${nodeUnpinned.join(', ')}`);
    } catch (err) {
      out.push('Node.js (0 packages):', `  package.json unreadable: ${err.message}`);
    }
  } else {
    out.push('Node.js: package.json missing');
  }
  out.push('');
  const pyUnpinned = [];
  const reqPath = path.join(ROOT, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    const lines = fs.readFileSync(reqPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    out.push(`Python (${lines.length} packages):`);
    for (const line of lines) {
      out.push(`  ${line}`);
      if (!line.includes('==')) pyUnpinned.push(`${line} (not pinned)`);
    }
    if (pyUnpinned.length) out.push(`Unpinned: ${pyUnpinned.join(', ')}`);
  } else {
    out.push('Python: requirements.txt missing');
  }
  return out.join('\n');
}
function verifyZeroExecution() {
  const src = fs.readFileSync(__filename, 'utf8');
  const forbidden = ['exec' + 'Sync(', 'sp' + 'awn(', 'exec' + 'File(', 'child' + '_process'];
  const violations = forbidden.filter(f => src.includes(f));
  if (violations.length) {
    throw new Error(`dep-scan zero-execution violation: ${violations.join(', ')}`);
  }
  return true;
}
module.exports = { depScan, verifyZeroExecution };

if (require.main === module) {
  verifyZeroExecution();
  console.log('Zero-execution invariant confirmed');
  console.log(depScan());
}
