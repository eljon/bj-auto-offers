// Item (auto parts) database: search, filter by type, edit, CSV import/export, bulk price changes.
import * as store from '../store.js';
import { state, onChange, itemTypes } from '../state.js';
import {
  esc, icon, money, num, modal, confirmDialog, toast, parseNum, round2, parseCSV, toCSV, download, readFile, imageToDataURL,
} from '../ui.js';
import { SAMPLE_ITEMS } from '../sample.js';
import {
  withPrice, withInitialPrice, originalPrice, isPriceChanged, priceHistoryOf, priceHistoryHTML,
} from '../prices.js';

const MAX_ROWS = 400;

const COLUMN_ALIASES = {
  type: ['type', 'product type', 'category', 'group', 'kategori', 'lloji'],
  code: ['code', 'part', 'part no', 'part number', 'sku', 'ref', 'reference', 'oem', 'kodi'],
  brand: ['brand', 'make', 'manufacturer', 'marka'],
  description: ['description', 'name', 'product', 'item', 'title', 'pershkrimi'],
  unit: ['unit', 'uom', 'njesia'],
  price: ['price', 'unit price', 'cost', 'amount', 'cmimi'],
};

export function filterItems(items, q, type) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (type && (i.type || '').trim() !== type) return false;
    if (!terms.length) return true;
    const hay = `${i.type} ${i.code} ${i.brand} ${i.description}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function openItemForm(item = null, { onSaved } = {}) {
  const isNew = !item?.id;
  const it = { type: '', code: '', brand: '', description: '', unit: 'pcs', price: '', image: '', ...(item || {}) };
  // Latest saved version of the item; reverting from the history section saves right away.
  let current = isNew ? null : { ...item };
  let image = it.image || '';
  const preview = () => (image ? `<img src="${esc(image)}" alt="">` : `${icon('upload')}<span>Add photo</span>`);
  modal({
    title: isNew ? 'New item' : 'Edit item',
    body: `<div class="form-grid">
      <div class="photo-field span2">
        <label class="photo-drop" title="Product photo">${preview()}<input type="file" accept="image/*" data-photo hidden></label>
        <div class="photo-side">
          <label>Item name / product type<input name="type" list="dl-types" required autocomplete="off" value="${esc(it.type)}" placeholder="e.g. Transmission filter"></label>
          <button type="button" class="btn small ghost" data-rm-photo ${image ? '' : 'hidden'}>Remove photo</button>
        </div>
      </div>
      <label>Part number<input name="code" autocomplete="off" value="${esc(it.code)}"></label>
      <label class="span2">Application / description<textarea name="description" rows="3" required>${esc(it.description)}</textarea></label>
      <label>Brand<input name="brand" list="dl-brands" autocomplete="off" value="${esc(it.brand)}"></label>
      <label>Unit<input name="unit" list="dl-units" autocomplete="off" value="${esc(it.unit)}"></label>
      <label>Price (₱)<input name="price" inputmode="decimal" required autocomplete="off" value="${esc(it.price)}"></label>
      ${isNew ? '<label class="check span2"><input type="checkbox" name="again"> Add another after saving</label>' : ''}
      ${isNew ? '' : `<div class="span2 price-history">
        <div class="ph-head"><h4>Price history</h4>
          <button type="button" class="btn small" data-revert>${icon('undo')}<span>Revert to original price</span></button></div>
        <div data-history></div>
      </div>`}
    </div>
    <datalist id="dl-types">${itemTypes().map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
    <datalist id="dl-brands">${[...new Set([...state.brands.map((b) => b.name), ...state.items.map((i) => i.brand)].filter(Boolean))].sort().map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
    <datalist id="dl-units"><option value="pcs"><option value="set"><option value="pair"><option value="l"><option value="kg"><option value="m"></datalist>`,
    onMount: (dlg) => {
      dlg.querySelector(isNew && !it.type ? '[name=type]' : '[name=description]').focus();
      const drop = dlg.querySelector('.photo-drop');
      const rm = dlg.querySelector('[data-rm-photo]');
      const refresh = () => {
        drop.innerHTML = preview() + '<input type="file" accept="image/*" data-photo hidden>';
        rm.hidden = !image;
      };
      dlg.addEventListener('change', async (e) => {
        if (!e.target.matches('[data-photo]') || !e.target.files[0]) return;
        try { image = await imageToDataURL(e.target.files[0], 400, 'auto'); refresh(); } catch (err) { toast(err.message, 'error'); }
      });
      rm.addEventListener('click', () => { image = ''; refresh(); });
      dlg._resetPhoto = () => { image = ''; refresh(); };

      if (!current) return;
      const historyBox = dlg.querySelector('[data-history]');
      const revertBtn = dlg.querySelector('[data-revert]');
      const showHistory = () => {
        historyBox.innerHTML = priceHistoryHTML(current);
        revertBtn.disabled = !isPriceChanged(current);
      };
      const savePrice = (price, source, note) => {
        current = { ...withPrice(current, price, source, note), updatedAt: Date.now() };
        const { id, ...data } = current;
        store.set('items', id, data);
        dlg.querySelector('[name=price]').value = current.price;
        showHistory();
        toast(`Price set to ${money(current.price)}`);
      };
      revertBtn.addEventListener('click', () => savePrice(originalPrice(current), 'revert'));
      historyBox.addEventListener('click', (e) => {
        const b = e.target.closest('[data-restore]');
        if (b) savePrice(priceHistoryOf(current)[Number(b.dataset.restore)].price, 'restore');
      });
      showHistory();
    },
    onSubmit: (form) => {
      const f = Object.fromEntries(new FormData(form));
      const fields = {
        type: f.type.trim(),
        code: f.code.trim(),
        brand: f.brand.trim(),
        description: f.description.trim(),
        unit: f.unit.trim() || 'pcs',
        image,
        createdAt: item?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      const price = round2(parseNum(f.price));
      const data = isNew
        ? withInitialPrice({ ...fields, price })
        : (({ id: _id, ...rest }) => rest)(withPrice({ ...current, ...fields }, price, 'edit'));
      let id = item?.id;
      if (isNew) id = store.add('items', data);
      else store.set('items', id, data);
      onSaved?.({ ...data, id });
      toast(isNew ? 'Item added' : 'Item saved');
      if (isNew && f.again) {
        form.reset();
        form.closest('dialog')._resetPhoto();
        form.type.value = data.type;
        form.unit.value = data.unit;
        form.brand.value = data.brand;
        form.description.focus();
        return false;
      }
      return true;
    },
  });
}

function importDialog() {
  modal({
    title: 'Import items from CSV',
    wide: true,
    submit: 'Import',
    body: `<p class="muted">Columns are matched by header name: <b>type</b>, <b>code</b>, <b>brand</b>, <b>description</b>, <b>unit</b>, <b>price</b>.
      Comma, semicolon or tab separated. Export from Excel with "Save as CSV".</p>
      <label class="file-drop"><input type="file" accept=".csv,.txt,text/csv" name="file">${icon('upload')}<span>Choose a CSV file</span></label>
      <label class="check"><input type="checkbox" name="update" checked> Update existing items with the same code</label>
      <div class="import-preview" data-preview></div>`,
    onMount: (dlg) => {
      const input = dlg.querySelector('[name=file]');
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        dlg.querySelector('.file-drop span').textContent = file.name;
        const rows = parseCSV(await readFile(file));
        dlg._parsed = mapRows(rows);
        const { items, unmatched } = dlg._parsed;
        dlg.querySelector('[data-preview]').innerHTML = items.length
          ? `<p><b>${items.length}</b> items found.${unmatched.length ? ` Ignored columns: ${unmatched.map(esc).join(', ')}.` : ''}</p>
             <div class="table-scroll"><table class="mini"><tr><th>Type</th><th>Code</th><th>Brand</th><th>Description</th><th>Unit</th><th>Price</th></tr>
             ${items.slice(0, 6).map((i) => `<tr><td>${esc(i.type)}</td><td>${esc(i.code)}</td><td>${esc(i.brand)}</td><td>${esc(i.description)}</td><td>${esc(i.unit)}</td><td>${esc(i.price)}</td></tr>`).join('')}
             </table></div>`
          : '<p class="error-text">No rows with a description were found. Check the header row.</p>';
      });
    },
    onSubmit: async (form) => {
      const parsed = form.closest('dialog')._parsed;
      if (!parsed?.items.length) { toast('Choose a CSV file first', 'error'); return false; }
      const byCode = new Map(state.items.filter((i) => i.code).map((i) => [i.code.toLowerCase(), i]));
      const now = Date.now();
      const entries = parsed.items.map((data) => {
        const existing = form.update.checked && data.code ? byCode.get(data.code.toLowerCase()) : null;
        if (!existing) return { data: withInitialPrice({ ...data, createdAt: now, updatedAt: now }, now) };
        const { id, ...rest } = existing;
        const { price, ...fields } = data;
        return { id, data: { ...withPrice({ ...rest, ...fields }, price, 'import'), createdAt: existing.createdAt || now, updatedAt: now } };
      });
      await store.setMany('items', entries);
      const updated = entries.filter((e) => e.id).length;
      toast(`Imported ${entries.length - updated} new, updated ${updated}`);
      return true;
    },
  });
}

function mapRows(rows) {
  if (!rows.length) return { items: [], unmatched: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[._]/g, ' '));
  const idx = {};
  const unmatched = [];
  header.forEach((h, i) => {
    const field = Object.keys(COLUMN_ALIASES).find((f) => COLUMN_ALIASES[f].includes(h));
    if (field && idx[field] === undefined) idx[field] = i;
    else if (h) unmatched.push(rows[0][i]);
  });
  // Headerless file: assume type, code, brand, description, unit, price.
  const hasHeader = Object.keys(idx).length >= 2;
  const body = hasHeader ? rows.slice(1) : rows;
  const pos = hasHeader ? idx : { type: 0, code: 1, brand: 2, description: 3, unit: 4, price: 5 };
  const get = (r, f) => (pos[f] === undefined ? '' : String(r[pos[f]] ?? '').trim());
  const items = body
    .map((r) => ({
      type: get(r, 'type'),
      code: get(r, 'code'),
      brand: get(r, 'brand'),
      description: get(r, 'description'),
      unit: get(r, 'unit') || 'pcs',
      price: round2(parseNum(get(r, 'price'))),
    }))
    .filter((i) => i.description);
  return { items, unmatched: hasHeader ? unmatched : [] };
}

function adjustDialog(items) {
  modal({
    title: 'Adjust prices',
    submit: 'Apply',
    body: `<p class="muted">Changes the price of the <b>${items.length}</b> item${items.length === 1 ? '' : 's'} currently shown.</p>
      <div class="form-grid">
        <label>Change (%)<input name="pct" inputmode="decimal" placeholder="e.g. 5 or -10" required></label>
        <label>Round to<select name="round">
          <option value="0.01">0.01</option><option value="0.1">0.10</option><option value="0.5">0.50</option>
          <option value="1">1.00</option><option value="0.99">.99 ending</option></select></label>
      </div>`,
    onSubmit: async (form) => {
      const pct = parseNum(form.pct.value);
      if (!pct) { toast('Enter a percentage', 'error'); return false; }
      const step = form.round.value;
      const roundTo = (p) => {
        if (step === '0.99') return Math.max(0.99, Math.ceil(p) - 0.01);
        const s = Number(step);
        return round2(Math.round(p / s) * s);
      };
      const now = Date.now();
      const note = `${pct > 0 ? '+' : ''}${num(pct)}%`;
      await store.setMany('items', items.map(({ id, ...data }) => ({
        id, data: { ...withPrice(data, roundTo((Number(data.price) || 0) * (1 + pct / 100)), 'bulk', note), updatedAt: now },
      })));
      toast(`Updated ${items.length} prices`);
      return true;
    },
  });
}

export function mount(root) {
  let q = '';
  let type = '';
  let sort = 'type';
  let shown = [];

  root.innerHTML = `<div class="page-wrap">
    <div class="view-head">
      <div><h1>Items</h1><p class="muted" data-count></p></div>
      <div class="actions">
        <button class="btn" data-act="import">${icon('upload')}<span>Import</span></button>
        <button class="btn" data-act="export">${icon('download')}<span>Export</span></button>
        <button class="btn primary" data-act="new">${icon('plus')}<span>New item</span></button>
      </div>
    </div>
    <div class="filters">
      <label class="search">${icon('search')}<input type="search" placeholder="Search code, description, brand" data-q></label>
      <select data-sort aria-label="Sort">
        <option value="type">Sort: type</option><option value="description">Sort: description</option>
        <option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
        <option value="recent">Recently changed</option>
      </select>
      <button class="btn ghost" data-act="adjust" title="Adjust prices of the items shown">${icon('percent')}<span>Adjust prices</span></button>
      <button class="btn ghost" data-act="revert-all" title="Set the items shown back to their original prices">${icon('undo')}<span>Revert to original</span></button>
    </div>
    <div class="chips" data-chips></div>
    <div class="item-list" data-list></div>
  </div>`;

  const list = root.querySelector('[data-list]');

  const renderChips = () => {
    const counts = new Map();
    state.items.forEach((i) => { const t = (i.type || '').trim(); if (t) counts.set(t, (counts.get(t) || 0) + 1); });
    if (type && !counts.has(type)) type = '';
    root.querySelector('[data-chips]').innerHTML = counts.size
      ? `<button class="chip ${type ? '' : 'active'}" data-type="">All <span>${state.items.length}</span></button>`
        + itemTypes().map((t) => `<button class="chip ${t === type ? 'active' : ''}" data-type="${esc(t)}">${esc(t)} <span>${counts.get(t)}</span></button>`).join('')
      : '';
  };

  const render = () => {
    shown = filterItems(state.items, q, type);
    const by = {
      type: (a, b) => (a.type || '').localeCompare(b.type || '') || (a.description || '').localeCompare(b.description || ''),
      description: (a, b) => (a.description || '').localeCompare(b.description || ''),
      'price-asc': (a, b) => (a.price || 0) - (b.price || 0),
      'price-desc': (a, b) => (b.price || 0) - (a.price || 0),
      recent: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    }[sort];
    shown.sort(by);
    root.querySelector('[data-count]').textContent =
      `${state.items.length} item${state.items.length === 1 ? '' : 's'}${shown.length !== state.items.length ? `, ${shown.length} shown` : ''}`;

    if (!state.loaded.items) { list.innerHTML = '<div class="empty">Loading...</div>'; return; }
    if (!state.items.length) {
      list.innerHTML = `<div class="empty big">${icon('box')}<h3>Your parts database is empty</h3>
        <p>Add items one by one, import a CSV from Excel, or start with sample data.</p>
        <div class="actions"><button class="btn" data-act="sample">Load sample parts</button>
        <button class="btn" data-act="import">Import CSV</button>
        <button class="btn primary" data-act="new">New item</button></div></div>`;
      return;
    }
    if (!shown.length) { list.innerHTML = '<div class="empty">No items match.</div>'; return; }

    list.innerHTML = `<div class="item-row head"><span></span><span>Item</span><span>Part no.</span><span>Application</span><span>Brand</span><span class="num">Price</span><span></span></div>`
      + shown.slice(0, MAX_ROWS).map((i) => `<div class="item-row" data-edit="${esc(i.id)}" tabindex="0">
        <span class="ir-img">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : ''}</span>
        <span class="ir-type"><span class="pill">${esc(i.type || 'No type')}</span></span>
        <span class="ir-code mono">${esc(i.code)}</span>
        <span class="ir-desc">${esc(i.description)}</span>
        <span class="ir-brand muted">${esc(i.brand)}</span>
        <span class="ir-price num"><b>${esc(money(i.price))}</b><small class="muted"> / ${esc(i.unit || 'pcs')}</small>
          ${isPriceChanged(i) ? `<small class="was" title="Original price">was ${esc(money(originalPrice(i)))}</small>` : ''}</span>
        <span class="ir-actions">
          <button class="icon-btn" data-dup="${esc(i.id)}" title="Duplicate" aria-label="Duplicate">${icon('copy')}</button>
          <button class="icon-btn" data-del="${esc(i.id)}" title="Delete" aria-label="Delete">${icon('trash')}</button>
        </span>
      </div>`).join('')
      + (shown.length > MAX_ROWS ? `<div class="empty">Showing ${MAX_ROWS} of ${shown.length}. Search or pick a type to narrow down.</div>` : '');
  };

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'new') return openItemForm(type ? { type } : null);
    if (act === 'import') return importDialog();
    if (act === 'adjust') return shown.length ? adjustDialog(shown) : toast('No items to adjust');
    if (act === 'revert-all') {
      const changed = shown.filter(isPriceChanged);
      if (!changed.length) return toast('All items shown already have their original price');
      const ok = await confirmDialog(
        `Set ${changed.length} item${changed.length === 1 ? '' : 's'} back to the original price? The change is recorded in each item's price history.`,
        { title: 'Revert to original prices', ok: 'Revert', danger: false },
      );
      if (!ok) return;
      const now = Date.now();
      await store.setMany('items', changed.map(({ id, ...data }) => ({
        id, data: { ...withPrice(data, originalPrice(data), 'revert'), updatedAt: now },
      })));
      return toast(`Reverted ${changed.length} price${changed.length === 1 ? '' : 's'}`);
    }
    if (act === 'sample') {
      const now = Date.now();
      await store.setMany('items', SAMPLE_ITEMS.map((data) => ({ data: withInitialPrice({ ...data, createdAt: now, updatedAt: now }, now) })));
      return toast('Sample parts added');
    }
    if (act === 'export') {
      const rows = [['type', 'code', 'brand', 'description', 'unit', 'price'],
        ...shown.map((i) => [i.type, i.code, i.brand, i.description, i.unit, i.price])];
      return download(`items-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + toCSV(rows), 'text/csv');
    }
    const chip = t.closest('[data-type]');
    if (chip) { type = chip.dataset.type; renderChips(); render(); return; }
    const dup = t.closest('[data-dup]');
    if (dup) {
      const src = state.items.find((i) => i.id === dup.dataset.dup);
      if (src) { const { id, ...rest } = src; openItemForm({ ...rest, createdAt: undefined }); }
      return;
    }
    const del = t.closest('[data-del]');
    if (del) {
      const it = state.items.find((i) => i.id === del.dataset.del);
      if (it && (await confirmDialog(`Delete "${it.description}"? Offers that already contain it keep their copy.`))) {
        store.remove('items', it.id);
        toast('Item deleted');
      }
      return;
    }
    const row = t.closest('[data-edit]');
    if (row) openItemForm(state.items.find((i) => i.id === row.dataset.edit));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('[data-edit]')) openItemForm(state.items.find((i) => i.id === e.target.dataset.edit));
  });
  root.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; render(); });
  root.querySelector('[data-sort]').addEventListener('change', (e) => { sort = e.target.value; render(); });

  renderChips();
  render();
  return onChange((what) => {
    if (what === 'items') { renderChips(); render(); }
    if (what === 'settings') render();
  });
}
