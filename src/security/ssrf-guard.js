'use strict';

const dns = require('dns').promises;
const net = require('net');

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(address) {
  const value = address.toLowerCase();
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice(7);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertSafeUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input));
  } catch (_) {
    throw new Error('Invalid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed.');
  }
  const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => isPrivateAddress(record.address))) {
    throw new Error('URL resolves to a private or local address.');
  }
  return { url: parsed, address: records[0].address, family: records[0].family };
}

function pinnedLookup(address, family) {
  return (hostname, options, callback) => callback(null, address, family);
}

module.exports = { assertSafeUrl, isPrivateAddress, pinnedLookup };
