'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'links.json');

function load(dataFile) {
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return [];
  }
}

function save(dataFile, links) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(links, null, 2));
}

// shortcut: links.json is ephemeral disk on Render free tier, so the list
// resets on redeploy (survives idle sleep/wake on the same instance).
// Upgrade to a managed DB if that becomes a problem.
function createStore(dataFile = DATA_FILE) {
  const links = load(dataFile);
  const pingStatus = new Map();

  return {
    getLinks() {
      return links.map((l) => ({ ...l, ...(pingStatus.get(l.url) || {}) }));
    },
    addLink(url) {
      if (links.some((l) => l.url === url)) return { added: false, reason: 'duplicate' };
      links.push({ url, addedAt: new Date().toISOString() });
      save(dataFile, links);
      return { added: true };
    },
    recordPing(url, outcome) {
      pingStatus.set(url, {
        lastPingAt: new Date().toISOString(),
        lastStatus: outcome.ok ? 'ok' : String(outcome.status || outcome.error || 'error'),
        lastLatencyMs: outcome.latencyMs,
      });
    },
  };
}

module.exports = { createStore };

if (require.main === module) {
  const assert = require('assert');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), `store-test-${Date.now()}.json`);
  const store = createStore(tmpFile);
  assert.strictEqual(store.addLink('https://a.example').added, true);
  assert.strictEqual(store.addLink('https://a.example').added, false); // duplicate rejected
  assert.strictEqual(store.getLinks().length, 1);
  fs.unlinkSync(tmpFile);
  console.log('store self-check passed');
}
