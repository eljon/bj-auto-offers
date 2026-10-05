// Gallery of offers and price lists with live page thumbnails.
import * as store from '../store.js';
import { state, onChange } from '../state.js';
import { esc, icon, money, fmtDate, confirmDialog, toast } from '../ui.js';
import { KIND_LABEL, newOffer, createOffer, duplicateOffer, normalizeOffer } from '../model.js';
import { renderPage } from '../page.js';

export function mount(root) {
  let q = '';
  let kind = '';

  root.innerHTML = `<div class="page-wrap">
    <div class="view-head">
      <div><h1>Offers &amp; price lists</h1><p class="muted" data-count></p></div>
      <div class="actions">
        <button class="btn" data-new="pricelist">${icon('list')}<span>New price list</span></button>
        <button class="btn primary" data-new="offer">${icon('plus')}<span>New offer</span></button>
      </div>
    </div>
    <div class="filters">
      <label class="search">${icon('search')}<input type="search" placeholder="Search title, customer, number" data-q></label>
      <div class="seg" data-kinds>
        <button data-k="" class="active">All</button><button data-k="offer">Offers</button><button data-k="pricelist">Price lists</button>
      </div>
    </div>
    <div class="card-grid" data-list></div>
  </div>`;

  const list = root.querySelector('[data-list]');

  const render = () => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = state.offers
      .filter((o) => !kind || o.kind === kind)
      .filter((o) => {
        const hay = [o.title, o.number, o.client?.name, o.client?.company].join(' ').toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    root.querySelector('[data-count]').textContent = `${state.offers.length} document${state.offers.length === 1 ? '' : 's'}`;

    if (!state.loaded.offers) {
      list.innerHTML = '<div class="empty">Loading...</div>';
      return;
    }
    if (!rows.length) {
      list.innerHTML = state.offers.length
        ? '<div class="empty">No matches.</div>'
        : `<div class="empty big">${icon('file')}<h3>No offers yet</h3>
            <p>Create an offer for a customer, or a price list of your parts.</p>
            <div class="actions"><button class="btn" data-new="pricelist">New price list</button>
            <button class="btn primary" data-new="offer">New offer</button></div></div>`;
      return;
    }
    list.innerHTML = rows.map((raw) => {
      const o = normalizeOffer(raw);
      const who = o.client.company || o.client.name;
      return `<article class="offer-card" data-open="${esc(o.id)}" tabindex="0">
        <div class="oc-thumb"><div class="oc-page">${renderPage(o, state.settings)}</div></div>
        <div class="oc-body">
          <div class="oc-line"><span class="pill kind-${o.kind}">${KIND_LABEL[o.kind]}</span><span class="muted small">${esc(o.number)}</span></div>
          <h3>${esc(o.title || 'Untitled')}</h3>
          <p class="muted small">${who ? esc(who) : '&nbsp;'}</p>
          <div class="oc-line">
            <span class="muted small">${esc(fmtDate(o.date))} &middot; ${o.lines.length} item${o.lines.length === 1 ? '' : 's'}</span>
            ${o.kind === 'offer' ? `<b>${esc(money(o.total, o.currency))}</b>` : ''}
          </div>
        </div>
        <div class="oc-actions">
          <span class="status s-${esc(o.status || 'draft')}">${esc(o.status || 'draft')}</span>
          <span>
            <button class="icon-btn" data-dup="${esc(o.id)}" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button>
            <button class="icon-btn" data-del="${esc(o.id)}" title="Delete" aria-label="Delete">${icon('trash')}</button>
          </span>
        </div>
      </article>`;
    }).join('');
  };

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const neu = t.closest('[data-new]');
    if (neu) {
      location.hash = `#/offer/${createOffer(newOffer(neu.dataset.new))}`;
      return;
    }
    const k = t.closest('[data-k]');
    if (k) {
      kind = k.dataset.k;
      root.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('active', b === k));
      render();
      return;
    }
    const dup = t.closest('[data-dup]');
    if (dup) {
      const src = state.offers.find((o) => o.id === dup.dataset.dup);
      if (src) { duplicateOffer(src); toast('Duplicated'); }
      return;
    }
    const del = t.closest('[data-del]');
    if (del) {
      const o = state.offers.find((x) => x.id === del.dataset.del);
      if (o && (await confirmDialog(`Delete "${o.title || 'Untitled'}" (${o.number})? This cannot be undone.`))) {
        store.remove('offers', o.id);
        toast('Deleted');
      }
      return;
    }
    const open = t.closest('[data-open]');
    if (open) location.hash = `#/offer/${open.dataset.open}`;
  });
  root.addEventListener('keydown', (e) => {
    const open = e.target.closest?.('[data-open]');
    if (open && e.key === 'Enter' && e.target === open) location.hash = `#/offer/${open.dataset.open}`;
  });
  root.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; render(); });

  render();
  return onChange((what) => { if (what === 'offers' || what === 'settings') render(); });
}
