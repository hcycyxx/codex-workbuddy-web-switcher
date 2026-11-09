const format = value => value > 0 && value < 0.000001 ? value.toExponential(2) : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(value);
const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function chartData(usage, accounts, selectedId, period) {
  const selected = accounts.filter(a => !selectedId || a.id === selectedId);
  const known = selected.filter(a => valid(a.balance?.remaining));
  const remaining = known.length ? known.reduce((sum, a) => sum + a.balance.remaining, 0) : null;
  const dates = known.map(a => a.balance.checkedAt).filter(valid);
  return {
    consumed: valid(usage?.summary?.knownCredit) ? usage.summary.knownCredit : null,
    remaining,
    missingBalances: selected.length - known.length,
    accountCount: selected.length,
    knownBalances: known.length,
    oldestBalanceAt: dates.length ? Math.min(...dates) : null,
    unknownRequests: usage?.summary?.unknownRequests ?? 0,
    periodLabel: ({ today: '今天', month: '本月', all: '全部记录' })[period] || '所选时段',
  };
}

export function axisMax(value) {
  if (!valid(value) || value === 0) return 1;
  const raw = value * 1.15, power = 10 ** Math.floor(Math.log10(raw)), fraction = raw / power;
  return ([1, 2, 2.5, 5, 10].find(n => n >= fraction) ?? 10) * power;
}

export function chartMarkup(data) {
  const maximum = axisMax(Math.max(data.consumed ?? 0, data.remaining ?? 0));
  const bottom = 218, top = 38, height = bottom - top;
  const consumedLabel = `${data.periodLabel}已确认消耗`;
  const remainingLabel = data.missingBalances && data.knownBalances ? '已查询账号的剩余积分' : '最近查询的剩余积分';
  const parts = [`<svg class="credit-bars" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 284" role="img" aria-labelledby="credit-bars-title credit-bars-description"><title id="credit-bars-title">消耗积分与剩余积分</title><desc id="credit-bars-description">${escape(consumedLabel)} ${escape(data.consumed === null ? '未知' : format(data.consumed))} 积分；${escape(remainingLabel)} ${escape(data.remaining === null ? '未查询' : format(data.remaining))} 积分。两柱为独立数值，不表示同一套餐的已用与剩余比例。</desc><text x="74" y="20" class="chart-unit">积分</text>`];
  for (let i = 0; i <= 4; i++) {
    const y = bottom - height * i / 4, tick = maximum * i / 4;
    parts.push(`<line x1="90" y1="${y}" x2="688" y2="${y}" class="chart-grid"/><text x="76" y="${y + 4}" text-anchor="end" class="chart-tick">${escape(format(tick))}</text>`);
  }
  const bars = [{ x: 258, value: data.consumed, label: '消耗积分', detail: data.periodLabel, kind: 'spent' }, { x: 528, value: data.remaining, label: '剩余积分', detail: data.missingBalances && data.knownBalances ? '部分账号 · 最近查询' : '最近查询', kind: 'remaining' }];
  for (const b of bars) {
    const barHeight = b.value === null ? 0 : b.value / maximum * height;
    if (barHeight > 0) parts.push(`<rect x="${b.x - 46}" y="${bottom - barHeight}" width="92" height="${barHeight}" rx="4" class="chart-bar ${b.kind}"><title>${escape(b.label)}：${escape(format(b.value))} 积分</title></rect>`);
    parts.push(`<text x="${b.x}" y="${Math.max(top - 12, bottom - barHeight - 12)}" text-anchor="middle" class="chart-value${b.value === null ? ' chart-unknown' : ''}">${escape(b.value === null ? (b.kind === 'remaining' ? '未查询' : '未知') : format(b.value))}</text><text x="${b.x}" y="246" text-anchor="middle" class="chart-label">${b.label}</text><text x="${b.x}" y="267" text-anchor="middle" class="chart-detail">${escape(b.detail)}</text>`);
  }
  parts.push('</svg>'); return parts.join('');
}
