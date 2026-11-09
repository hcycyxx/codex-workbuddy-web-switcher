import test from 'node:test';
import assert from 'node:assert/strict';
import { chartData, chartMarkup, axisMax } from '../public/credit-chart.js';

const usage = (knownCredit = 12.5, unknownRequests = 0) => ({ summary: { knownCredit, unknownRequests } });
const account = (id, remaining, checkedAt = 1000) => ({ id, balance: remaining === undefined ? null : { remaining, checkedAt } });

test('credit chart follows selected account and reports period separately from balance', () => {
  const d = chartData(usage(12.5), [account('one', 123), account('two', 999)], 'one', 'today');
  assert.equal(d.consumed, 12.5); assert.equal(d.remaining, 123); assert.equal(d.periodLabel, '今天'); assert.equal(d.accountCount, 1);
});
test('all-account balance sums known accounts and discloses missing ones', () => {
  const d = chartData(usage(), [account('one', 100, 2000), account('two', undefined), account('three', 1.25, 1000)], '', 'month');
  assert.equal(d.remaining, 101.25); assert.equal(d.missingBalances, 1); assert.equal(d.oldestBalanceAt, 1000); assert.equal(d.periodLabel, '本月');
  assert.match(chartMarkup(d), /已查询账号的剩余积分/);
});
test('unqueried balance is not zero, but a queried zero balance is valid', () => {
  assert.equal(chartData(usage(), [account('one', undefined)], '', 'all').remaining, null);
  const zero = chartData(usage(0), [account('one', 0)], '', 'today'); assert.equal(zero.remaining, 0); assert.equal(zero.consumed, 0);
  assert.doesNotMatch(chartMarkup(zero), /NaN|Infinity/);
  assert.match(chartMarkup(chartData(usage(), [], '', 'today')), /未查询/);
});
test('unknown request costs excluded from confirmed bar and carried as a count', () => {
  const d = chartData(usage(0, 3), [], '', 'today'); assert.equal(d.consumed, 0); assert.equal(d.unknownRequests, 3);
});
test('invalid balance values omitted, requested ID does not leak another account balance', () => {
  const d = chartData(usage(), [account('a', NaN), account('b', Infinity), account('c', -1)], '', 'today'); assert.equal(d.remaining, null); assert.equal(d.missingBalances, 3);
  assert.equal(chartData(usage(), [account('one', 500)], 'missing-id', 'today').remaining, null);
});
test('chart uses one linear scale with explicit numeric labels and accessible description', () => {
  const d = chartData(usage(50), [account('one', 100)], '', 'today'); const svg = chartMarkup(d);
  assert.match(svg, /role="img"/); assert.match(svg, /50/); assert.match(svg, /100/); assert.match(svg, /不表示同一套餐/);
  assert.equal(axisMax(0), 1); assert.ok(axisMax(100) > 100); assert.ok(axisMax(.0001) > .0001);
  const heights = [...svg.matchAll(/width="92" height="([\d.]+)"/g)].map(m => Number(m[1])); assert.equal(heights[1] / heights[0], 2);
});
test('chart escapes labels and never interpolates executable HTML', () => {
  const d = chartData(usage(), [], '', 'today'); d.periodLabel = '<img src=x onerror=alert(1)>';
  const svg = chartMarkup(d); assert.doesNotMatch(svg, /<img/); assert.match(svg, /&lt;img/);
});
