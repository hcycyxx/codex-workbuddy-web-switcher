import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotice } from '../public/notice.js';
import { safeError } from '../src/errors.js';

function fixture() {
  const classes = new Set(), tasks = new Map(); let id = 0, click;
  const element = { hidden: true, role: 'status', classList: { remove: c => classes.delete(c), toggle: (c, yes) => yes ? classes.add(c) : classes.delete(c) }, setAttribute: (k, v) => { element[k] = v; } };
  const message = { textContent: '' }, close = { addEventListener: (event, handler) => { click = handler; } };
  const notices = createNotice(element, { message, close, schedule: (fn, delay) => { tasks.set(++id, { fn, delay }); return id; }, cancel: key => tasks.delete(key) });
  return { notices, element, message, classes, tasks, click: () => click() };
}
test('error notice expires instead of staying permanently on every page', () => {
  const f = fixture(); f.notices.show('网络暂时不可用', true);
  assert.equal(f.element.hidden, false); assert.equal(f.element.role, 'alert'); assert.ok(f.classes.has('failure'));
  const timer = [...f.tasks.values()][0]; assert.equal(timer.delay, 12000); timer.fn();
  assert.equal(f.element.hidden, true); assert.equal(f.message.textContent, ''); assert.ok(!f.classes.has('failure'));
});
test('success notice expires sooner and a close button dismisses errors', () => {
  const f = fixture(); f.notices.show('完成'); assert.equal([...f.tasks.values()][0].delay, 4500);
  f.notices.show('错误', true); f.click(); assert.equal(f.element.hidden, true); assert.equal(f.tasks.size, 0);
});
test('page/retry clear invalidates old operation context and removes text', () => {
  const f = fixture(); const context = f.notices.clear(); assert.ok(f.notices.isCurrent(context));
  f.notices.show('旧错误', true); f.notices.clear(); assert.ok(!f.notices.isCurrent(context)); assert.equal(f.element.hidden, true);
});
test('expired old timer cannot hide a newer notification', () => {
  const f = fixture(); f.notices.show('旧错误', true); const stale = [...f.tasks.values()][0].fn;
  f.notices.show('新结果'); stale(); assert.equal(f.element.hidden, false); assert.equal(f.message.textContent, '新结果'); assert.equal(f.tasks.size, 1);
});
test('messages are plain text and not interpreted as HTML', () => {
  const f = fixture(); f.notices.show('<img src=x onerror=alert(1)>', true); assert.equal(f.message.textContent, '<img src=x onerror=alert(1)>');
});
test('network failure and timeout do not incorrectly instruct a new login', () => {
  const network = safeError({ name: 'TypeError', cause: { code: 'ECONNRESET' } }); assert.match(network, /网络/); assert.doesNotMatch(network, /重新登录/);
  assert.match(safeError({ name: 'TimeoutError' }), /超时/);
  assert.match(safeError({ cause: { code: 'CERT_HAS_EXPIRED' } }), /证书/);
});
test('unrecognized internal error text is hidden instead of leaking credentials', () => {
  const error = new Error('token FAKE_SECRET_DO_NOT_EXPOSE'); const text = safeError(error); assert.ok(!text.includes('FAKE_SECRET')); assert.match(text, /记录已保留/);
});
