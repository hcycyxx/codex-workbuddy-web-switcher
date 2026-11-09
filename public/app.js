'use strict';
import { chartData, chartMarkup } from './credit-chart.js';
import { createNotice } from './notice.js';
const $ = s => document.querySelector(s);
const state = { token: '', region: 'cn', activeId: null, activeByRegion: {}, accounts: [], models: [], modelAccount: null, login: null, generation: 0, stopped: false };
const number = n => typeof n === 'number' ? n.toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : '未提供';
const time = v => v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未提供';
function el(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
const notices = createNotice($('#notice'), { message: $('#notice-message'), close: $('#dismiss-notice') });
const notify = (text, failure = false) => notices.show(text, failure);
async function api(path, body) {
  let r;
  try { r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Admin-Token': state.token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error('无法连接本机反代，请确认 Start-Web.ps1 仍在运行后刷新页面'); }
  let d; try { d = await r.json(); } catch { throw new Error('本机反代返回异常，请刷新页面后重试'); }
  if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : d.error?.message || '操作未完成'); return d;
}
async function busy(button, job, success) {
  const context = notices.clear();
  const text = button.textContent; button.disabled = true; button.textContent = '处理中…';
  try { await job(); if (success && notices.isCurrent(context)) notify(success); } catch (e) { if (notices.isCurrent(context)) notify(e.message, true); }
  finally { button.disabled = false; button.textContent = text; }
}
function action(text, job, cls) { const b = el('button', text, cls); b.addEventListener('click', () => busy(b, job)); return b; }
function datum(label, value, cls) { const div = el('div'); div.append(el('dt', label), el('dd', value, cls)); return div; }
function refreshSelects() {
  for (const id of ['#usage-account', '#model-account']) {
    const select = $(id), previous = select.value; select.replaceChildren();
    if (id === '#usage-account') select.append(new Option('全部账号', ''));
    for (const a of state.accounts) select.append(new Option(`${a.region === 'cn' ? '国内' : '国际'} · ${a.label || a.nickname}`, a.id));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
    else if (id === '#model-account' && state.activeId) select.value = state.activeId;
  }
}
async function loadAccounts() { const d = await api('/api/accounts'); Object.assign(state, d); renderAccounts(); refreshSelects(); }
function renderAccounts() {
  const root = $('#account-list'); root.replaceChildren();
  const list = state.accounts.filter(a => a.region === state.region);
  if (!list.length) {
    const empty = el('div', undefined, 'empty'); empty.append(el('strong', `还没有${state.region === 'cn' ? '国内版' : '国际版'}账号`), el('span', '扫码添加，或读取本机已经登录的 WorkBuddy 账号。')); root.append(empty); return;
  }
  for (const a of list) {
    const selected = state.activeByRegion[a.region] === a.id, active = state.activeId === a.id;
    const card = el('article', undefined, `account${selected ? ' selected' : ''}`);
    const head = el('div', undefined, 'account-head'), title = el('h2', a.label || a.nickname);
    if (active) title.append(el('span', '默认选用', 'badge')); else if (selected) title.append(el('span', '本区域选用', 'badge'));
    const names = el('div'); names.append(title, el('p', `${a.uidHint || '身份已保存'} · ${a.source === 'desktop' ? '本机登录' : '扫码授权'}${a.expiresAt && a.expiresAt < Date.now() ? ' · 登录可能已过期' : ''}`, 'account-sub')); head.append(names);
    if (!selected) head.append(action('选用账号', async () => { await api('/api/accounts/select', { accountId: a.id }); await loadAccounts(); notify('已选用。正在进行中的请求仍归原账号。'); }));
    const data = el('dl', undefined, 'account-data');
    const balance = datum('剩余积分 · 最近查询', a.balance ? number(a.balance.remaining) : '尚未查询', 'balance-value'); balance.lastChild.append(el('span', a.balance ? '积分' : '', 'balance-unit')); data.append(balance, datum('邮箱', a.email || '上游未提供'), datum('手机号', a.phone || '上游未提供'));
    card.append(head, data);
    if (a.balance?.packages?.length) {
      const packages = el('ul', undefined, 'package-list');
      for (const p of a.balance.packages) { const row = el('li'); row.append(el('span', p.name), el('span', `${number(p.remaining)} 积分${p.expiresAt ? ` · 到期 ${p.expiresAt}` : p.refreshAt ? ` · 周期结束 ${p.refreshAt}` : ''}`)); packages.append(row); } card.append(packages);
    }
    const bottom = el('div', undefined, 'account-bottom');
    bottom.append(action('刷新余额', async () => { await api('/api/balance', { accountId: a.id }); await loadAccounts(); notify('余额已更新。'); }), action('修改备注', async () => { const label = window.prompt('填写便于区分账号的备注（最多 80 字）', a.label || ''); if (label === null) return; await api('/api/accounts/label', { accountId: a.id, label }); await loadAccounts(); }), el('span', a.balance ? `更新于 ${time(a.balance.checkedAt)}` : '未查询余额', 'updated'));
    card.append(bottom); root.append(card);
  }
}
function emptyRow(root, message, span) { const tr = el('tr'), td = el('td', message); td.colSpan = span; tr.append(td); root.replaceChildren(tr); }
let usageGeneration = 0;
async function loadUsage() {
  const generation = ++usageGeneration;
  const id = $('#usage-account').value, period = $('#usage-period').value;
  $('#credit-chart-meta').textContent = '正在更新积分概览…';
  let d, accountData;
  try { [d, accountData] = await Promise.all([api(`/api/usage?period=${encodeURIComponent(period)}&accountId=${encodeURIComponent(id)}`), api('/api/accounts')]); }
  catch (error) { if (generation === usageGeneration) $('#credit-chart-meta').textContent = '更新失败，图表保留上次结果。点击“刷新记录”重试。'; throw error; }
  if (generation !== usageGeneration || state.stopped) return;
  const chart = chartData(d, accountData.accounts, id, period);
  // Markup contains only validated numeric values and escaped fixed labels.
  $('#credit-chart').innerHTML = chartMarkup(chart);
  const notes = [`消耗按${chart.periodLabel}的桥接记录汇总，剩余取最近查询的余额；两柱不代表同一套餐的比例。`];
  if (!chart.accountCount) notes.push('还没有账号，请先添加账号。');
  else if (!chart.knownBalances) notes.push('余额尚未查询，点击图表右上方“刷新余额”获取。');
  else {
    if (chart.missingBalances) notes.push(`${chart.missingBalances} 个账号尚未查询余额，未计入剩余积分柱。`);
    if (chart.oldestBalanceAt) notes.push(`余额最早更新于 ${time(chart.oldestBalanceAt)}。`);
  }
  if (chart.unknownRequests) notes.push(`${chart.unknownRequests} 次请求未提供积分，未计入消耗柱。`);
  $('#credit-chart-meta').textContent = notes.join(' ');
  const summary = $('#usage-summary'); summary.replaceChildren(datum('已确认扣分', number(d.summary.knownCredit)), datum('请求次数', number(d.summary.requests)), datum('未知扣费', `${d.summary.unknownRequests} 次`), datum('未完成请求', `${d.summary.failedRequests} 次`));
  const root = $('#usage-rows'); root.replaceChildren();
  if (!d.rows.length) return emptyRow(root, '这个时段还没有经过本反代的请求。', 5);
  for (const r of d.rows) {
    const tr = el('tr'), name = el('td'); name.append(el('div', r.accountName), el('div', r.model, 'cell-sub'));
    tr.append(el('td', time(r.at)), name, el('td', `${number(r.inputTokens)} / ${number(r.outputTokens)}`), el('td', r.credit === null ? '未知' : number(r.credit), r.credit === null ? 'unknown' : 'credit'), el('td', r.status === 'ok' ? '完成' : r.status === 'cancelled' ? '已中断' : '失败', r.status === 'ok' ? '' : 'error')); root.append(tr);
  }
}
function renderModels() {
  const q = $('#model-search').value.trim().toLowerCase(), root = $('#model-rows'); root.replaceChildren();
  const models = state.models.filter(m => `${m.id} ${m.name}`.toLowerCase().includes(q));
  if (!models.length) return emptyRow(root, q ? '没有匹配的模型。' : '选择账号，点击“刷新模型目录”查看上游倍率。', 5);
  for (const m of models) { const tr = el('tr'), name = el('td'); name.append(el('div', m.name), el('div', m.id, 'cell-sub')); const rate = v => typeof v === 'number' ? `×${number(v)}` : '未提供'; tr.append(name, el('td', rate(m.currentMultiplier), 'credit'), el('td', rate(m.multiplier)), el('td', `${number(m.contextWindow)} / ${number(m.maxOutput)}`), el('td', m.promotion || '—')); root.append(tr); }
}
async function loadModels(force = false) {
  const id = $('#model-account').value; if (!id) { state.models = []; renderModels(); return; }
  const d = await api(`/api/models?accountId=${encodeURIComponent(id)}${force ? '&refresh=1' : ''}`);
  if ($('#model-account').value !== id) return;
  state.models = d.models; state.modelAccount = id; renderModels(); $('#model-meta').textContent = `目录更新 ${time(d.checkedAt)} · ${d.rateNote}`;
}
async function cancelLogin() { state.generation++; const id = state.login?.loginId; state.login = null; $('#login-panel').hidden = true; $('#login-link').hidden = true; $('#start-login').hidden = false; if (id) await api('/api/login/cancel', { loginId: id }); }
async function startLogin() {
  const generation = ++state.generation, region = state.region;
  const d = await api('/api/login/start', { region });
  if (generation !== state.generation) { await api('/api/login/cancel', { loginId: d.loginId }); return; }
  state.login = d; $('#login-link').href = d.verificationUri; $('#login-link').hidden = false; $('#start-login').hidden = true;
  $('#login-message').textContent = `请打开${region === 'cn' ? '国内版' : '国际版'}官方授权页扫码。链接约 10 分钟后过期，完成后自动加入账号。`;
  const poll = async () => {
    if (generation !== state.generation || !state.login) return;
    if (Date.now() > d.expiresAt) { await cancelLogin(); notify('授权链接已过期，请重新添加。', true); return; }
    try {
      const result = await api('/api/login/poll', { loginId: d.loginId });
      if (generation !== state.generation) return;
      if (result.done) { state.login = null; $('#login-panel').hidden = true; await loadAccounts(); notify('账号已添加。可先查询余额，再接入 Codex 或 CC Switch。'); return; }
    } catch (e) { if (generation !== state.generation) return; await cancelLogin().catch(() => {}); notify(e.message, true); return; }
    setTimeout(poll, 2500);
  }; setTimeout(poll, 2500);
}
async function loadConnection() { const d = await api('/api/ccswitch/config'); $('#base-url').value = d.baseUrl; $('#api-key').value = d.apiKey; $('#usage-script').value = d.script; }
for (const b of document.querySelectorAll('[data-page]')) b.addEventListener('click', async () => {
  notices.clear();
  document.querySelectorAll('.page').forEach(n => { n.hidden = n.id !== b.dataset.page; });
  document.querySelectorAll('[data-page]').forEach(n => { n.classList.toggle('active', n === b); if (n === b) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); });
  try { if (b.dataset.page === 'usage') await loadUsage(); if (b.dataset.page === 'connect') await loadConnection(); if (b.dataset.page === 'models') renderModels(); } catch (e) { notify(e.message, true); }
});
for (const b of document.querySelectorAll('[data-region]')) b.addEventListener('click', async () => {
  notices.clear();
  try { await cancelLogin(); state.region = b.dataset.region; document.querySelectorAll('[data-region]').forEach(n => { n.classList.toggle('selected', n === b); n.setAttribute('aria-pressed', String(n === b)); }); renderAccounts(); } catch (e) { notify(e.message, true); }
});
$('#add-account').addEventListener('click', () => { notices.clear(); $('#login-panel').hidden = false; $('#start-login').hidden = !!state.login; if (!state.login) $('#login-message').textContent = `添加${state.region === 'cn' ? '国内版' : '国际版'}账号，在官方授权页完成扫码或登录。`; });
$('#cancel-login').addEventListener('click', () => { notices.clear(); cancelLogin().catch(e => notify(e.message, true)); });
$('#start-login').addEventListener('click', e => busy(e.currentTarget, startLogin));
$('#import-desktop').addEventListener('click', e => busy(e.currentTarget, async () => { await api('/api/accounts/import-desktop', { region: state.region }); await loadAccounts(); }, '本机登录账号已加入。'));
$('#refresh-usage').addEventListener('click', e => busy(e.currentTarget, loadUsage));
$('#refresh-chart-balance').addEventListener('click', e => busy(e.currentTarget, async () => {
  const id = $('#usage-account').value, data = await api('/api/accounts');
  const selected = data.accounts.filter(a => !id || a.id === id);
  if (!selected.length) { notify('请先添加一个账号。', true); return; }
  let failed = 0;
  for (const a of selected) { try { await api('/api/balance', { accountId: a.id }); } catch { failed++; } }
  await loadUsage();
  notify(failed ? `${failed} 个账号的余额未能刷新，已保留最近查询结果。` : '余额已刷新。', failed > 0);
}));
$('#refresh-models').addEventListener('click', e => busy(e.currentTarget, () => loadModels(true)));
$('#usage-account').addEventListener('change', () => loadUsage().catch(e => notify(e.message, true)));
$('#usage-period').addEventListener('change', () => loadUsage().catch(e => notify(e.message, true)));
$('#model-account').addEventListener('change', () => { state.models = []; state.modelAccount = null; renderModels(); $('#model-meta').textContent = '账号已切换，请点击刷新目录。'; });
$('#model-search').addEventListener('input', renderModels);
$('#toggle-key').addEventListener('click', e => { const n = $('#api-key'); n.type = n.type === 'password' ? 'text' : 'password'; e.currentTarget.textContent = n.type === 'password' ? '显示' : '隐藏'; });
for (const [button, field] of [['#copy-key', '#api-key'], ['#copy-script', '#usage-script']]) $(button).addEventListener('click', e => busy(e.currentTarget, () => navigator.clipboard.writeText($(field).value), '已复制。'));
$('#stop-bridge').addEventListener('click', e => {
  if (!window.confirm('停止后会中断正在进行中的请求，并暂停客户端连接。已保存的账号和记录会保留。是否停止服务？')) return;
  const button = e.currentTarget;
  busy(button, async () => {
    await api('/api/shutdown', {}); state.stopped = true; state.generation++; state.login = null;
    document.querySelectorAll('button').forEach(b => { b.disabled = true; });
    document.title = 'WorkBuddy · 已停止'; $('.local').textContent = '服务已停止';
    notify('服务已停止，可以关闭页面。下次运行 Start-Web.ps1 即可重新启动。');
  }).then(() => { if (state.stopped) { button.disabled = true; button.textContent = '已停止'; } });
});
setInterval(() => { if (!state.stopped && !$('#models').hidden && state.modelAccount === $('#model-account').value) loadModels(false).catch(() => {}); }, 60000);
(async () => { try { const r = await fetch('/api/session'); if (!r.ok) throw new Error('管理页连接失败，请刷新重试'); state.token = (await r.json()).token; await loadAccounts(); renderModels(); } catch (e) { notify(e.message, true); } })();
