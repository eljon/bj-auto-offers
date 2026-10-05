// Price history for items and document lines.
// Every price change appends { price, at, source, note? } to `priceHistory`; the first entry is the original price.
import { esc, money, round2, num } from './ui.js';

export const PRICE_SOURCES = {
  initial: 'Original price',
  edit: 'Edited',
  bulk: 'Bulk adjustment',
  import: 'CSV import',
  revert: 'Reverted to original',
  restore: 'Restored from history',
  document: 'Edited in document',
  database: 'Updated from item database',
};

/** History of a record, synthesizing the original entry for records saved before history existed. */
export function priceHistoryOf(rec) {
  if (Array.isArray(rec.priceHistory) && rec.priceHistory.length) return rec.priceHistory;
  return [{ price: round2(rec.price), at: rec.createdAt || rec.addedAt || 0, source: 'initial' }];
}

export const originalPrice = (rec) => priceHistoryOf(rec)[0].price;
export const isPriceChanged = (rec) => round2(rec.price) !== round2(originalPrice(rec));

/** Returns a copy of rec with the new price and, when it changed, a new history entry. */
export function withPrice(rec, price, source, note = '') {
  const next = round2(price);
  const history = priceHistoryOf(rec);
  if (round2(rec.price) === next) return { ...rec, price: next, priceHistory: history };
  const entry = { price: next, at: Date.now(), source };
  if (note) entry.note = note;
  return { ...rec, price: next, priceHistory: [...history, entry] };
}

/** Starts the history of a new record at its current price. */
export const withInitialPrice = (rec, at = Date.now()) =>
  ({ ...rec, price: round2(rec.price), priceHistory: [{ price: round2(rec.price), at, source: 'initial' }] });

const when = (at) => (at
  ? new Date(at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Before history tracking');

/** Table of all price changes, newest first. Rows other than the current one get a "Use" button (data-restore=index). */
export function priceHistoryHTML(rec, { restorable = true } = {}) {
  const history = priceHistoryOf(rec);
  const orig = history[0].price;
  const rows = history.map((h, i) => {
    const prev = i ? history[i - 1].price : null;
    const diff = prev === null ? null : round2(h.price - prev);
    const pct = prev ? (diff / prev) * 100 : 0;
    const change = diff === null || diff === 0
      ? ''
      : `<span class="ph-diff ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '-'}${esc(money(Math.abs(diff)))} (${diff > 0 ? '+' : '-'}${esc(num(Math.abs(pct)))}%)</span>`;
    const current = i === history.length - 1;
    return `<tr class="${current ? 'ph-current' : ''}">
      <td class="ph-when">${esc(when(h.at))}</td>
      <td><b>${esc(money(h.price))}</b>${change ? `<br>${change}` : ''}</td>
      <td class="ph-src">${esc(PRICE_SOURCES[h.source] || h.source)}${h.note ? ` <span class="muted">(${esc(h.note)})</span>` : ''}
        ${current ? '<span class="pill">Current</span>' : ''}</td>
      <td class="ph-act">${restorable && !current && round2(h.price) !== round2(rec.price)
        ? `<button type="button" class="btn small ghost" data-restore="${i}">Use</button>` : ''}</td>
    </tr>`;
  }).reverse().join('');
  return `<div class="ph">
    <div class="ph-summary">
      <span>Original <b>${esc(money(orig))}</b></span>
      <span>Current <b>${esc(money(rec.price))}</b></span>
      <span class="muted">${history.length - 1} change${history.length === 2 ? '' : 's'}</span>
    </div>
    <div class="table-scroll"><table class="ph-table">${rows}</table></div>
  </div>`;
}
