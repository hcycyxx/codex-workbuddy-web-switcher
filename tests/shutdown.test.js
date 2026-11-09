import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { makeServer } from '../src/server.js';

test('authorized shutdown closes only this bridge; unauthenticated request rejected', async () => {
  const server = makeServer({}, { apiKey: 'fixture-key', adminToken: 'fixture-admin' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await fetch(base + '/api/shutdown', { method: 'POST', body: '{}' }); assert.equal(denied.status, 401);
    const closed = once(server, 'close');
    const r = await fetch(base + '/api/shutdown', { method: 'POST', headers: { 'X-Admin-Token': 'fixture-admin' }, body: '{}' }); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
    await closed; assert.equal(server.listening, false);
  } finally { server.closeAllConnections(); if (server.listening) server.close(); }
});
