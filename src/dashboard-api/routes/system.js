// src/dashboard/routes/system.js
// /api/system — CPU, RAM, disk, uptime, bot status

'use strict';

const express = require('express');
const os = require('os');
const { execSync } = require('child_process');

const router = express.Router();

function getDiskStats() {
  try {
    const raw = execSync("df -h / | tail -1").toString().trim();
    const parts = raw.split(/\s+/);
    // parts: Filesystem, Size, Used, Avail, Use%, Mounted
    return {
      disk_total: parts[1] || 'N/A',
      disk_used: parts[2] || 'N/A',
      disk_free: parts[3] || 'N/A',
      disk_pct: parts[4] || 'N/A'
    };
  } catch (_) {
    return { disk_total: 'N/A', disk_used: 'N/A', disk_free: 'N/A', disk_pct: 'N/A' };
  }
}

function getCpuUsage() {
  try {
    // Load averages: 1m, 5m, 15m
    const load = os.loadavg();
    const cpus = os.cpus().length;
    return {
      load_1m: load[0].toFixed(2),
      load_5m: load[1].toFixed(2),
      load_15m: load[2].toFixed(2),
      cpu_cores: cpus,
      // Rough usage % = load1 / cores * 100
      cpu_pct: Math.min(((load[0] / cpus) * 100).toFixed(1), 100)
    };
  } catch (_) {
    return { load_1m: 'N/A', load_5m: 'N/A', load_15m: 'N/A', cpu_cores: 'N/A', cpu_pct: 'N/A' };
  }
}

function getBotStatus() {
  try {
    const result = execSync("systemctl is-active korvin 2>/dev/null").toString().trim();
    return result === 'active' ? 'online' : result;
  } catch (_) {
    return 'unknown';
  }
}

router.get('/', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const uptimeSecs = os.uptime();
  const uptimeHours = (uptimeSecs / 3600).toFixed(1);

  const disk = getDiskStats();
  const cpu = getCpuUsage();
  const botStatus = getBotStatus();

  res.json({
    timestamp: new Date().toISOString(),
    bot_status: botStatus,
    uptime_seconds: uptimeSecs,
    uptime_hours: uptimeHours,
    mem_total_mb: (totalMem / 1024 / 1024).toFixed(0),
    mem_used_mb: (usedMem / 1024 / 1024).toFixed(0),
    mem_free_mb: (freeMem / 1024 / 1024).toFixed(0),
    mem_pct: ((usedMem / totalMem) * 100).toFixed(1),
    ...disk,
    ...cpu
  });
});

module.exports = router;