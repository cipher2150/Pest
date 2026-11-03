'use strict';

const INTERVAL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10 * 1000;
const STARTUP_DELAY_MS = 5 * 1000;

async function pingOne(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return { ok: res.status < 400, status: res.status, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function runCycle(store) {
  const linkTargets = store.getLinks().map((l) => l.url);
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  const selfTarget = selfUrl ? new URL('/healthz', selfUrl).toString() : null;
  const targets = selfTarget ? [...linkTargets, selfTarget] : linkTargets;

  const results = await Promise.allSettled(targets.map(pingOne));
  results.forEach((result, i) => {
    if (i >= linkTargets.length) return; // self-ping result has no reader; don't bother storing it
    const outcome = result.status === 'fulfilled' ? result.value : { ok: false, error: result.reason?.message };
    store.recordPing(targets[i], outcome);
  });
}

function start(store) {
  setTimeout(() => runCycle(store), STARTUP_DELAY_MS);
  setInterval(() => runCycle(store), INTERVAL_MS);
}

module.exports = { start, runCycle, pingOne };

if (require.main === module) {
  (async () => {
    const assert = require('assert');
    const originalFetch = global.fetch;
    const calledUrls = [];
    global.fetch = async (url) => { calledUrls.push(url); return { status: 200 }; };
    process.env.RENDER_EXTERNAL_URL = 'https://self.example';

    const recorded = [];
    const fakeStore = {
      getLinks: () => [{ url: 'https://a.example', addedAt: 'x' }],
      recordPing: (url, outcome) => recorded.push({ url, outcome }),
    };

    await runCycle(fakeStore);

    assert.deepStrictEqual(calledUrls.sort(), ['https://a.example', 'https://self.example/healthz']);
    assert.strictEqual(recorded.length, 1); // self-ping isn't recorded, only the real link is
    assert.strictEqual(recorded[0].url, 'https://a.example');
    assert.strictEqual(recorded[0].outcome.ok, true);

    global.fetch = originalFetch;
    delete process.env.RENDER_EXTERNAL_URL;
    console.log('scheduler self-check passed');
  })();
}
