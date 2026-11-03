'use strict';
const express = require('express');
const path = require('path');
const { createStore } = require('./lib/store');
const { validateUrl } = require('./lib/ssrf');
const scheduler = require('./lib/scheduler');

const app = express();
const store = createStore();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/links', (req, res) => {
  res.json({ selfUrl: process.env.RENDER_EXTERNAL_URL || null, links: store.getLinks() });
});

app.post('/api/links', async (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  const result = await validateUrl(url.trim());
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }
  const added = store.addLink(result.url);
  if (!added.added) {
    return res.status(409).json({ error: 'link already added' });
  }
  res.status(201).json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`keepalive-pinger listening on port ${PORT}`);
  scheduler.start(store);
});
