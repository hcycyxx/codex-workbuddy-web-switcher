import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { start } from '../src/server.js';

test('fresh isolated startup serves the web switcher and gracefully releases its lock', async () => {
  // An empty directory; no desktop credentials imported and no paid upstream calls.
  const dataDir = resolve('.runtime', `empty-startup-${randomUUID()}`);
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const { server, engine } = await start({ port, dataDir }); const base = `http://127.0.0.1:${port}`;
  try {
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ready, false);
    assert.equal(health.service, 'codex-workbuddy-web-switcher');
    assert.equal(health.maxBodyBytes, 1024 ** 3);
    assert.equal(health.maxBodyLabel, '1 GiB');
    assert.equal(engine.accounts().accounts.length, 0);
    const page = await fetch(base); assert.equal(page.status, 200); assert.ok((await page.text()).includes('账号与余额'));
    const js = await fetch(base + '/app.js'); assert.equal(js.status, 200); assert.ok(js.headers.get('content-type').includes('javascript'));
    const chart = await fetch(base + '/credit-chart.js'); assert.equal(chart.status, 200); assert.ok(chart.headers.get('content-type').includes('javascript')); assert.ok((await chart.text()).includes('export function chartMarkup'));
    const session = await (await fetch(base + '/api/session')).json();
    const closed = once(server, 'close'); await fetch(base + '/api/shutdown', { method: 'POST', headers: { 'X-Admin-Token': session.token }, body: '{}' }); await closed;
    for (let i = 0; i < 20; i++) { try { await access(join(dataDir, 'bridge.lock')); } catch (e) { if (e.code === 'ENOENT') return; throw e; } await new Promise(r => setTimeout(r, 20)); }
    assert.fail('Runtime lock was not released');
  } finally { server.closeAllConnections(); if (server.listening) server.close(); }
});
