'use strict';
const dns = require('dns').promises;
const net = require('net');

const V4_BLOCKS = [
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16], // includes the 169.254.169.254 cloud metadata address
  ['0.0.0.0', 8],
];

function ipv4ToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inV4Block(ip, [base, bits]) {
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(base) & mask);
}

function isPrivateV4(ip) {
  return V4_BLOCKS.some((block) => inV4Block(ip, block));
}

function isPrivateV6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (/^f[cd]/.test(lower)) return true; // fc00::/7 (unique local)
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 (link-local)
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

function isPrivateIP(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true; // not a recognizable IP -> treat as unsafe
}

// shortcut: validates at submit time only, not per-ping, so DNS rebinding
// (a name resolving safely now, privately later) isn't closed. Low severity
// for a hobby keep-alive tool; upgrade by re-validating inside scheduler.pingOne.
async function validateUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http/https URLs are allowed' };
  }
  if (url.hostname.toLowerCase() === 'localhost') {
    return { ok: false, reason: 'localhost is not allowed' };
  }
  let records;
  try {
    records = await dns.lookup(url.hostname, { all: true });
  } catch {
    return { ok: false, reason: 'could not resolve host' };
  }
  if (records.length === 0 || records.some((r) => isPrivateIP(r.address))) {
    return { ok: false, reason: 'URL resolves to a private/internal address' };
  }
  return { ok: true, url: url.toString() };
}

module.exports = { validateUrl, isPrivateIP };

if (require.main === module) {
  (async () => {
    const assert = require('assert');
    assert.strictEqual((await validateUrl('http://127.0.0.1')).ok, false);
    assert.strictEqual((await validateUrl('http://10.0.0.5')).ok, false);
    assert.strictEqual((await validateUrl('http://169.254.169.254')).ok, false);
    assert.strictEqual((await validateUrl('ftp://example.com')).ok, false);
    assert.strictEqual((await validateUrl('http://localhost')).ok, false);
    assert.strictEqual((await validateUrl('not a url')).ok, false);
    assert.strictEqual((await validateUrl('https://paintsync-dzsb.onrender.com')).ok, true);
    console.log('ssrf self-check passed');
  })();
}
