import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { parseCredits, parseModels, currentModels, readChatStream, Client, domainOf, jsonRequest } from '../src/upstream.js';
import { Engine } from '../src/engine.js';
import { Store } from '../src/store.js';
import { makeServer, makeUsageScript, formatBytes } from '../src/server.js';
process.env.DSH_HOME = resolve('.runtime', 'mock-discovery');

class MemoryStore {
  constructor() { this.state = { accounts: [], activeId: null }; this.logs = {}; }
  async change(fn) { return fn(this.state); }
  async append(k, v) { (this.logs[k] ??= []).push(v); }
  async rows(k) { return this.logs[k] ?? []; }
}
const credential = (uid = 'fixture-user', region = 'cn') => ({ uid, accessToken: 'FAKE_ACCESS_NOT_REAL', refreshToken: 'FAKE_REFRESH_NOT_REAL', domain: region === 'cn' ? 'www.workbuddy.cn' : 'www.workbuddy.ai', region, nickname: `Fixture ${uid}` });
const response = data => new Response(JSON.stringify({ code: 0, data }), { headers: { 'content-type': 'application/json' } });
const stream = text => new ReadableStream({ start(c) { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += 7) c.enqueue(b.slice(i, i + 7)); c.close(); } });
const modelData = { models: [{ id: 'fixture-model', name: '测试模型', maxInputTokens: 128000, maxOutputTokens: 4096, credits: 'x0.79 credits' }], agents: [] };

test('personal balance uses cycle precise family; pool is not spendable balance', () => {
  const d = { Response: { Data: { Accounts: [{ PackageName: 'monthly', CapacityType: 4, CapacityRemain: 500, CycleCapacityRemain: 0, CycleCapacityRemainPrecise: '0.12345678', CycleCapacitySize: 500, CycleCapacityUsedPrecise: '499.87654322' }, { PackageName: 'gift', CapacityType: 1, CycleCapacityRemainPrecise: '10.25', CycleCapacitySize: 20, CycleCapacityUsed: 9.75 }] } } };
  const b = parseCredits(d); assert.equal(b.remaining, 10.37345678); assert.equal(b.packages[0].remaining, .12345678);
});
test('enterprise spent credit is subtracted and absent data never becomes zero', () => {
  assert.equal(parseCredits({ credit: 1234, limitNum: 5000 }, true).remaining, 3766);
  assert.throws(() => parseCredits({}), /格式变化/);
  assert.throws(() => parseCredits({ credit: 1 }, true), /余额/);
  assert.equal(parseCredits({ Response: { Data: { Accounts: [] } } }).remaining, 0);
});
test('expired gift omitted; monthly kept; missing balance rejected', () => {
  const accounts = [{ CapacityType: 1, CycleCapacityRemain: 12, ExpiredTime: '2020-01-01T00:00:00Z' }, { CapacityType: 4, CycleCapacityRemain: 0 }];
  assert.equal(parseCredits({ Response: { Data: { Accounts: accounts } } }).packages.length, 1);
  assert.throws(() => parseCredits({ Response: { Data: { Accounts: [{}] } } }), /缺少余额/);
});
test('promotion handles midnight window dynamically without refetching', () => {
  const data = { ...modelData, modelPromotions: [{ id: 'night', modelIds: ['fixture-model'], enabled: true, priority: 100, badge: { label: '夜间折扣', display: 'activeOnly' }, discount: { discountedCredits: '0.06x', displayMode: 'replace' }, schedule: { timezone: 'Asia/Shanghai', validFrom: '2026-01-01T00:00:00+08:00', validUntil: '2027-01-01T00:00:00+08:00', daily: [{ start: '23:00', end: '07:50' }] } }] };
  const models = parseModels(data);
  assert.equal(models[0].multiplier, .79);
  assert.equal(currentModels(models, Date.parse('2026-11-09T01:00:00+08:00'))[0].currentMultiplier, .06);
  assert.equal(currentModels(models, Date.parse('2026-11-09T12:00:00+08:00'))[0].currentMultiplier, .79);
});
test('SSE usage-only final frame is captured across UTF-8/chunk boundaries', async () => {
  const data = 'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"credit":0,"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]';
  const r = await readChatStream(stream(data)); assert.equal(r.text, '你好'); assert.equal(r.usage.credit, 0); assert.equal(r.usage.prompt_tokens, 10);
});
test('tool call fragments are assembled and missing usage remains unknown', async () => {
  const r = await readChatStream(stream('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_","arguments":"{"}}]}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"weather","arguments":"}"}}]},"finish_reason":"tool_calls"}]}\n\n'));
  assert.equal(r.toolCalls[0].function.name, 'get_weather'); assert.equal(r.toolCalls[0].function.arguments, '{}'); assert.equal(r.usage, null);
});
test('truncated streams fail while preserving already reported credit', async () => {
  let seen; await assert.rejects(readChatStream(stream('data: {"usage":{"credit":0.125},"choices":[]}\n\n'), { onUsage: u => seen = u }), /提前中断/); assert.equal(seen.credit, .125);
});
test('allowed domains only and redirect rejection', async () => {
  assert.throws(() => domainOf('www.workbuddy.cn.evil.example'));
  assert.throws(() => domainOf('www.workbuddy.cn/path'));
  let options; await jsonRequest(async (u, o) => { options = o; return response({ ok: true }); }, 'https://www.workbuddy.cn/v3/config'); assert.equal(options.redirect, 'error');
});
test('request account remains pinned if active account changes during streaming', async () => {
  let finish; const pause = new Promise(r => finish = r);
  const store = new MemoryStore(), client = { chat: async (a, b, o) => { await pause; o.onUsage({ credit: .5, prompt_tokens: 100 }); return { text: 'ok', toolCalls: [], usage: { credit: .5, prompt_tokens: 100 } }; } };
  const e = new Engine(store, { client }); const a = await e.add(credential('one')); const b = await e.add(credential('two', 'global'));
  const running = e.run({ model: 'fixture-model' }); await e.select(b.id); finish(); await running;
  assert.equal(store.logs.requests[0].accountId, a.id); assert.equal(store.logs.requests[0].credit, .5);
  assert.equal(e.accounts().activeByRegion.cn, a.id); assert.equal(e.accounts().activeByRegion.global, b.id);
});
test('partial credit on error retained; success with no usage counted unknown', async () => {
  const store = new MemoryStore(); const e = new Engine(store, { client: { chat: async (a, b, o) => { o.onUsage({ credit: .25 }); throw new Error('fixture error'); } } });
  await e.add(credential()); await assert.rejects(e.run({ model: 'fixture-model' }));
  e.client.chat = async () => ({ toolCalls: [], text: 'ok', usage: null }); await e.run({ model: 'fixture-model' });
  const u = await e.usage(null, 'all'); assert.equal(u.summary.knownCredit, .25); assert.equal(u.summary.unknownRequests, 1); assert.equal(u.summary.failedRequests, 1);
});
test('refresh single-flight for same account and never swaps to another account', async () => {
  let calls = 0; const store = new MemoryStore(); const e = new Engine(store, { client: { refresh: async a => { calls++; await new Promise(r => setTimeout(r, 10)); return { ...a, accessToken: 'new-fake' }; } } });
  const a = await e.add(credential()); await Promise.all([e.refresh(a.id), e.refresh(a.id), e.refresh(a.id)]); assert.equal(calls, 1); assert.equal(e.account(a.id).accessToken, 'new-fake');
});
test('OAuth validates profile and does not return credentials in public account', async () => {
  const requests = []; const fetcher = async (u, opts) => { requests.push(u); if (u.includes('/auth/state')) return response({ state: 'fixture-state', authUrl: 'https://www.codebuddy.cn/login?state=fixture-state' }); if (u.includes('/auth/token?')) return response({ accessToken: 'fake-secret', refreshToken: 'fake-refresh', domain: 'www.workbuddy.cn', expiresIn: 3600 }); if (u.endsWith('/login/account')) return response({ uid: 'qr-user', nickname: '扫码测试账号' }); throw Error('Unexpected mock URL'); };
  const e = new Engine(new MemoryStore(), { client: new Client(fetcher) }); const start = await e.startLogin('cn'); const result = await e.pollLogin(start.loginId);
  assert.equal(result.done, true); assert.equal(result.account.nickname, '扫码测试账号'); assert.ok(!JSON.stringify(result).includes('fake-secret')); assert.ok(!JSON.stringify(e.accounts()).includes('fake-refresh')); assert.equal(requests.length, 3);
});
test('OAuth cancellation while profile pending cannot add account', async () => {
  let unlock, entered; const ready = new Promise(r => entered = r), wait = new Promise(r => unlock = r);
  const fetcher = async u => u.includes('/auth/state') ? response({ state: 's' }) : u.includes('/auth/token?') ? response({ accessToken: 'fake', domain: 'www.workbuddy.cn' }) : (entered(), await wait, response({ uid: 'late' }));
  const e = new Engine(new MemoryStore(), { client: new Client(fetcher) }); const s = await e.startLogin(); const pending = e.pollLogin(s.loginId); await ready; e.cancelLogin(s.loginId); unlock(); await pending; assert.equal(e.accounts().accounts.length, 0);
});
test('international catalog merges app and CLI; separate billing domain preserved', async () => {
  const paths = []; const f = async (u, o) => { paths.push(u); if (u.includes('/v3/config')) { const cli = o.headers['User-Agent'].startsWith('CLI'); return response({ models: [{ ...modelData.models[0], id: cli ? 'cli-only' : 'app-only' }] }); } return response({ Response: { Data: { Accounts: [] } } }); };
  const c = new Client(f); const a = credential('global', 'global'); const m = await c.models(a); assert.deepEqual(m.map(x => x.id).sort(), ['app-only', 'cli-only']); await c.credits(a); assert.ok(paths.at(-1).startsWith('https://www.workbuddy.ai/'));
});
async function fixtureServer(fn) {
  const store = new MemoryStore(), client = { credits: async () => ({ remaining: 12.5, used: null, total: null, packages: [], checkedAt: Date.now() }), chat: async (a, b, o) => { o.onDelta?.({ type: 'text', text: '模拟回复' }); const usage = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13, credit: .125 }; o.onUsage(usage); return { text: '模拟回复', toolCalls: [], finishReason: 'stop', usage }; }, models: async () => parseModels(modelData) };
  const engine = new Engine(store, { client }); await engine.add(credential()); const server = makeServer(engine, { apiKey: 'fake-bridge-key', adminToken: 'fake-admin' }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn({ base, server, engine }); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
test('HTTP API authentication, cross-origin and DNS-rebinding protections', () => fixtureServer(async ({ base }) => {
  assert.equal((await fetch(base + '/api/accounts')).status, 401);
  assert.equal((await fetch(base + '/api/session', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer fake-bridge-key' } })).status, 200);
  const r = await new Promise((resolve, reject) => { const req = http.get(base + '/api/session', { headers: { host: 'evil.example' } }, r => { r.resume(); resolve(r); }); req.on('error', reject); }); assert.equal(r.statusCode, 403);
}));
test('request limits are configurable and only oversized bodies return 413', async () => {
  assert.equal(formatBytes(1024 ** 3), '1 GiB');
  assert.equal(formatBytes(16 * 1024 ** 2), '16 MiB');
  const store = new MemoryStore();
  const client = {
    chat: async (a, b, o) => {
      const usage = { prompt_tokens: 1, completion_tokens: 1, credit: 0 };
      o.onUsage(usage);
      return { text: 'ok', toolCalls: [], finishReason: 'stop', usage };
    },
  };
  const engine = new Engine(store, { client });
  await engine.add(credential());
  const server = makeServer(engine, { apiKey: 'key', adminToken: 'admin', maxBodyBytes: 2048 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.maxBodyLabel, '2 KiB');
    const ok = await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer key' },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
    assert.equal(ok.status, 200);
    const tooLarge = await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer key' },
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x'.repeat(3000) }] }),
    });
    assert.equal(tooLarge.status, 413);
    assert.match((await tooLarge.json()).error.message, /2 KiB/);
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
  }
});
test('Responses stream final usage contains real credit, not vendor placeholders', () => fixtureServer(async ({ base, engine }) => {
  const r = await fetch(base + '/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer fake-bridge-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture-model', input: 'mock', stream: true }) });
  const text = await r.text(); const frames = text.split('\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6))); const final = frames.find(f => f.type === 'response.completed');
  assert.equal(final.response.usage.input_tokens, 10); assert.equal(final.response.usage.credit, .125); assert.equal((await engine.usage()).summary.knownCredit, .125);
}));
test('nonstream Chat and Responses preserve usage, client tools and model', () => fixtureServer(async ({ base }) => {
  for (const path of ['/v1/chat/completions', '/v1/responses']) {
    const r = await fetch(base + path, { method: 'POST', headers: { Authorization: 'Bearer fake-bridge-key' }, body: JSON.stringify({ model: 'fixture-model', messages: [{ role: 'user', content: 'mock' }], input: 'mock' }) });
    assert.equal(r.status, 200); const d = await r.json(); assert.equal(d.model, 'fixture-model'); assert.equal(d.usage.credit, .125);
  }
}));
test('CC Switch usage script evaluates with documented variable replacement', () => fixtureServer(async ({ base }) => {
  const script = makeUsageScript(base).replaceAll('{{apiKey}}', 'fake-bridge-key').replaceAll('{{baseUrl}}', base + '/v1');
  const config = Function(`return ${script}`)(); const r = await fetch(config.request.url, config.request); assert.equal(r.status, 200); const d = config.extractor(await r.json()); assert.equal(d.remaining, 12.5); assert.equal(d.unit, '积分'); assert.equal(d.used, null);
}));
test('CC Switch query follows the configured region instead of global active account', () => fixtureServer(async ({ base, engine }) => {
  await engine.add(credential('international', 'global')); await engine.select(engine.store.state.activeByRegion.global);
  const script = makeUsageScript(base).replaceAll('{{apiKey}}', 'fake-bridge-key').replaceAll('{{baseUrl}}', base + '/cn/v1');
  const config = Function(`return ${script}`)(); assert.ok(config.request.url.endsWith('?region=cn'));
  const r = await fetch(config.request.url, config.request), d = await r.json(); assert.equal(d.planName, 'Fixture fixture-user');
}));
test('unsupported stateful/image requests rejected before any paid model call', () => fixtureServer(async ({ base, engine }) => {
  for (const b of [{ previous_response_id: 'previous' }, { input: [{ type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'https://example.test/pic' }] }] }]) {
    const r = await fetch(base + '/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer fake-bridge-key' }, body: JSON.stringify({ model: 'fixture-model', ...b }) }); assert.equal(r.status, 400);
  }
  assert.equal((await engine.usage(null, 'all')).summary.requests, 0);
}));
test('unavailable requested region rejected without falling through to other region', () => fixtureServer(async ({ base }) => {
  const r = await fetch(base + '/global/v1/models', { headers: { Authorization: 'Bearer fake-bridge-key' } }); assert.equal(r.status, 400);
}));
test('production vault encrypts fake credentials and serializes writes across reopen', async () => {
  const root = resolve('.runtime', `mock-store-${randomUUID()}`); await mkdir(root, { recursive: true });
  const s = await new Store(root).init(); await s.change(v => { v.accounts.push({ id: 'fake', accessToken: 'FAKE_SECRET_DO_NOT_EXPOSE' }); });
  await Promise.all(Array.from({ length: 12 }, (_, i) => s.append('requests', { requestId: i, credit: .1 })));
  const encrypted = await readFile(join(root, 'vault.enc.json'), 'utf8'); assert.ok(!encrypted.includes('FAKE_SECRET_DO_NOT_EXPOSE'));
  const reopened = await new Store(root).init(); assert.equal(reopened.state.accounts[0].accessToken, 'FAKE_SECRET_DO_NOT_EXPOSE'); assert.equal((await reopened.rows('requests')).length, 12);
  assert.ok((await readdir(root)).every(n => !n.endsWith('.tmp')));
});
