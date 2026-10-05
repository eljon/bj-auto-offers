// Canvas-style editor: A4 page in the middle, edited in place, with Items / Details / Design panels.
import * as store from '../store.js';
import { state, onChange, itemTypes } from '../state.js';
import {
  esc, icon, money, num, modal, toast, debounce, parseNum, round2, getPath, setPath, confirmDialog, imageToDataURL,
} from '../ui.js';
import {
  KIND_LABEL, STATUSES, FONTS, TEMPLATES, SWATCHES, normalizeOffer, lineFromItem, blankLine,
  lineTotal, totals, duplicateOffer, CATALOG_PRESET,
} from '../model.js';
import { renderPage, formatField, imageMap } from '../page.js';
import { filterItems, openItemForm } from './items.js';
import {
  withPrice, withInitialPrice, originalPrice, isPriceChanged, priceHistoryOf, priceHistoryHTML,
} from '../prices.js';

const PAGE_W = 794; // A4 width at 96 dpi
const PICK_LIMIT = 150;

export function mount(root, id) {
  let offer = null;
  let selected = null;
  let panel = 'items';
  let zoom = 'fit';
  let deleted = false;
  let pq = '';
  let ptype = '';
  let history = [];
  let future = [];

  root.innerHTML = `<div class="editor" data-editor>
    <div class="ed-top">
      <a class="icon-btn" href="#/offers" title="Back to offers" aria-label="Back">${icon('back')}</a>
      <div class="ed-title">
        <input class="title-in" data-title aria-label="Title" autocomplete="off">
        <span class="save-state" data-save></span>
      </div>
      <div class="ed-actions">
        <button class="icon-btn" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo')}</button>
        <button class="icon-btn" data-act="redo" title="Redo (Ctrl+Y)" aria-label="Redo">${icon('redo')}</button>
        <button class="btn ghost hide-sm" data-act="duplicate">${icon('copy')}<span>Duplicate</span></button>
        <button class="btn primary" data-act="print">${icon('print')}<span class="hide-xs">PDF / Print</span></button>
      </div>
    </div>
    <div class="ed-body">
      <aside class="ed-panel" aria-label="Editor panel">
        <div class="sheet-grip" data-act="close-sheet"></div>
        <div class="ed-tabs" role="tablist">
          <button data-tab="items" role="tab">${icon('box')}<span>Items</span></button>
          <button data-tab="details" role="tab">${icon('sliders')}<span>Details</span></button>
          <button data-tab="design" role="tab">${icon('palette')}<span>Design</span></button>
          <button class="icon-btn sheet-close" data-act="close-sheet" aria-label="Close panel">${icon('x')}</button>
        </div>
        <div class="ed-panel-body" data-panel></div>
      </aside>
      <section class="ed-stage">
        <div class="ed-canvas" data-canvas>
          <div class="canvas-inner"><div class="page-host" data-host><div class="empty">Loading...</div></div></div>
        </div>
        <div class="sel-bar" data-selbar hidden>
          <span class="sel-label" data-sel-label></span>
          <button data-sel="up" title="Move up" aria-label="Move up">${icon('up')}</button>
          <button data-sel="down" title="Move down" aria-label="Move down">${icon('down')}</button>
          <button data-sel="dup" title="Duplicate line" aria-label="Duplicate line">${icon('copy')}</button>
          <button data-sel="price" title="Price history and revert" aria-label="Price history">${icon('tag')}</button>
          <button data-sel="save-item" title="Save to item database" aria-label="Save to item database">${icon('save')}</button>
          <button data-sel="del" title="Remove line" aria-label="Remove line">${icon('trash')}</button>
          <button data-sel="none" title="Done" aria-label="Deselect">${icon('check')}</button>
        </div>
        <div class="zoom-bar">
          <button data-zoom="-" aria-label="Zoom out">${icon('minus')}</button>
          <button data-zoom="fit" class="zoom-val" data-zoom-val title="Fit to screen">100%</button>
          <button data-zoom="+" aria-label="Zoom in">${icon('plus')}</button>
        </div>
      </section>
    </div>
    <nav class="ed-mobile-bar">
      <button data-tab="items">${icon('box')}<span>Add items</span></button>
      <button data-tab="details">${icon('sliders')}<span>Details</span></button>
      <button data-tab="design">${icon('palette')}<span>Design</span></button>
    </nav>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const editorEl = $('[data-editor]');
  const host = $('[data-host]');
  const canvas = $('[data-canvas]');
  const panelBody = $('[data-panel]');
  const selbar = $('[data-selbar]');
  const titleIn = $('[data-title]');
  const isMobile = () => window.matchMedia('(max-width: 899px)').matches;

  // ---------- saving & history ----------

  const snap = () => JSON.stringify({ ...offer, updatedAt: 0, total: 0 });
  const pushHistory = () => {
    const s = snap();
    if (history[history.length - 1] === s) return;
    history.push(s);
    if (history.length > 80) history.shift();
    future = [];
    updateUndo();
  };
  const updateUndo = () => {
    $('[data-act=undo]').disabled = history.length < 2;
    $('[data-act=redo]').disabled = !future.length;
  };

  const setSaveState = (s) => {
    const el = $('[data-save]');
    el.dataset.state = s;
    el.textContent = { dirty: 'Editing', saved: navigator.onLine ? 'Saved' : 'Saved offline', error: 'Not saved' }[s] || '';
  };

  const writeNow = () => {
    if (deleted || !offer) return;
    pushHistory();
    offer.updatedAt = Date.now();
    offer.total = totals(offer).total;
    const { id: _ignored, ...data } = offer;
    try {
      store.set('offers', id, data).catch(() => setSaveState('error'));
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };
  const save = debounce(writeNow, 600);
  const changed = () => { setSaveState('dirty'); save(); };

  function restore(json) {
    offer = { ...JSON.parse(json), id };
    if (!offer.lines.some((l) => l.id === selected)) selected = null;
    renderAll();
    renderPanel();
    save.cancel();
    writeNow();
    updateUndo();
  }
  const undo = () => {
    save.flush();
    if (history.length < 2) return;
    future.push(history.pop());
    restore(history[history.length - 1]);
  };
  const redo = () => {
    save.flush();
    const s = future.pop();
    if (!s) return;
    history.push(s);
    const keep = future;
    restore(s);
    future = keep;
    updateUndo();
  };

  // ---------- page rendering ----------

  // Parts Catalog prints edge to edge like a flyer; other templates keep normal paper margins.
  const pageStyle = document.createElement('style');
  document.head.append(pageStyle);

  function renderAll() {
    pageStyle.textContent = offer.design.template === 'catalog' ? '@page { margin: 0 0 8mm; }' : '';
    host.innerHTML = renderPage(offer, state.settings, { interactive: true, selected, images: imageMap(state.items) });
    titleIn.value = offer.title || '';
    applyZoom();
    syncSelection();
  }

  function updateTotals() {
    for (const el of host.querySelectorAll('[data-lt]')) {
      const l = offer.lines.find((x) => x.id === el.dataset.lt);
      if (l) el.textContent = money(lineTotal(l));
    }
    const t = totals(offer);
    for (const el of host.querySelectorAll('[data-t]')) el.textContent = money(t[el.dataset.t]);
  }

  function applyZoom() {
    const page = host.querySelector('.page');
    if (!page) return;
    const pad = isMobile() ? 20 : 64;
    const fit = Math.min(1, (canvas.clientWidth - pad) / PAGE_W);
    const scale = zoom === 'fit' ? fit : zoom;
    page.style.zoom = scale;
    $('[data-zoom-val]').textContent = `${Math.round(scale * 100)}%`;
  }
  const ro = new ResizeObserver(() => { if (zoom === 'fit') applyZoom(); });
  ro.observe(canvas);

  // ---------- selection ----------

  function select(lineId, scroll = false) {
    selected = lineId;
    syncSelection();
    if (scroll && lineId) host.querySelector(`[data-row="${lineId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function syncSelection() {
    host.querySelectorAll('[data-row]').forEach((r) => r.classList.toggle('is-selected', r.dataset.row === selected));
    const line = offer?.lines.find((l) => l.id === selected);
    selbar.hidden = !line;
    if (!line) return;
    const n = offer.lines.indexOf(line) + 1;
    $('[data-sel-label]').textContent = `Line ${n} of ${offer.lines.length}`;
    selbar.querySelector('[data-sel=price]').classList.toggle('changed', isPriceChanged(line));
    selbar.querySelector('[data-sel=save-item]').hidden = Boolean(line.itemId && state.items.some((i) => i.id === line.itemId));
  }

  /** Sets a line's price and records the change in its history. */
  function setLinePrice(l, price, source, note) {
    const base = l.priceHistory?.length || l.itemId ? l : withInitialPrice(l);
    Object.assign(l, withPrice(base, price, source, note));
  }

  function linePriceDialog(l) {
    const { dlg, close } = modal({
      title: 'Price history',
      wide: true,
      submit: isPriceChanged(l) ? 'Revert to original price' : '',
      body: `<p class="muted">${esc(l.description || 'This line')}${l.code ? ` (${esc(l.code)})` : ''}. Changes made in this document.</p>
        ${priceHistoryHTML(l)}`,
      onSubmit: () => {
        setLinePrice(l, originalPrice(l), 'revert');
        renderAll(); changed();
        toast(`Price reverted to ${money(l.price)}`);
      },
    });
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-restore]');
      if (!b) return;
      setLinePrice(l, priceHistoryOf(l)[Number(b.dataset.restore)].price, 'restore');
      renderAll(); changed();
      toast(`Price set to ${money(l.price)}`);
      close();
    });
  }

  function lineAction(action) {
    const i = offer.lines.findIndex((l) => l.id === selected);
    if (i < 0) return;
    const lines = offer.lines;
    if (action === 'none') return select(null);
    if (action === 'up' && i > 0) [lines[i - 1], lines[i]] = [lines[i], lines[i - 1]];
    else if (action === 'down' && i < lines.length - 1) [lines[i + 1], lines[i]] = [lines[i], lines[i + 1]];
    else if (action === 'dup') {
      const copy = { ...lines[i], id: store.uid() };
      lines.splice(i + 1, 0, copy);
      selected = copy.id;
    } else if (action === 'del') {
      lines.splice(i, 1);
      selected = null;
      toast('Line removed. Undo is in the top bar.');
    } else if (action === 'price') {
      return linePriceDialog(lines[i]);
    } else if (action === 'save-item') {
      const l = lines[i];
      openItemForm({ type: l.type, code: l.code, brand: l.brand, description: l.description, unit: l.unit, price: l.price }, {
        onSaved: (item) => {
          Object.assign(l, { itemId: item.id, type: item.type, code: item.code, brand: item.brand, description: item.description, unit: item.unit, price: item.price });
          renderAll();
          changed();
        },
      });
      return;
    } else return;
    renderAll();
    if (selected) select(selected, true);
    if (panel === 'items') renderPickList();
    changed();
  }

  // ---------- panels ----------

  function openPanel(name) {
    panel = name;
    editorEl.classList.add('sheet-open');
    renderPanel();
  }

  function renderPanel() {
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === panel));
    if (!offer) return;
    if (panel === 'items') {
      panelBody.innerHTML = `<div class="form-stack">
        <label class="search">${icon('search')}<input type="search" placeholder="Search parts" data-pq value="${esc(pq)}" autocomplete="off"></label>
        <select data-ptype aria-label="Product type"><option value="">All product types</option>
          ${itemTypes().map((t) => `<option ${t === ptype ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <div class="row2">
          <button class="btn small" data-act="add-all">${icon('plus')}<span data-addall>Add all shown</span></button>
          <button class="btn small" data-act="add-custom">${icon('edit')}<span>Custom line</span></button>
        </div>
        <div class="pick-list" data-picklist></div>
        <button class="btn ghost small" data-act="new-item">${icon('plus')}<span>Create new item in database</span></button>
      </div>`;
      renderPickList();
      return;
    }
    if (panel === 'details') {
      const isOffer = offer.kind === 'offer';
      panelBody.innerHTML = `<div class="form-stack">
        <div class="seg full">${Object.entries(KIND_LABEL).map(([k, v]) => `<button data-kind="${k}" class="${offer.kind === k ? 'active' : ''}">${v}</button>`).join('')}</div>
        <label>Title<input data-bind="title" autocomplete="off"></label>
        <div class="row2">
          <label>Number<input data-bind="number" autocomplete="off"></label>
          <label>Date<input type="date" data-bind="date"></label>
        </div>
        <div class="row2">
          ${isOffer ? '<label>Valid for (days)<input data-bind="validDays" data-num inputmode="numeric"></label>' : ''}
          <label>Status<select data-bind="status">${STATUSES.map((s) => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
        </div>
        <h4>Customer</h4>
        <label class="check"><input type="checkbox" data-bind="design.showClient"> Show customer block on page</label>
        <label>Company<input data-bind="client.company" autocomplete="off"></label>
        <label>Contact person<input data-bind="client.name" autocomplete="off"></label>
        <label>Details<textarea data-bind="client.details" rows="3" placeholder="Address, phone, email"></textarea></label>
        <h4>Pricing</h4>
        <p class="muted small">All prices are in Philippine pesos (₱).</p>
        <label>VAT %<input data-bind="vatRate" data-num inputmode="decimal"></label>
        <label class="check"><input type="checkbox" data-bind="design.showVat"> ${isOffer ? 'Show subtotal and VAT' : 'Note that prices exclude VAT'}</label>
        ${isOffer ? '<label class="check"><input type="checkbox" data-bind="design.showDiscount"> Discount column</label>' : ''}
        <div class="row2">
          <button class="btn small" data-act="refresh-prices" title="Copy current database prices into this document">${icon('refresh')}<span>Update prices</span></button>
          <button class="btn small" data-act="global-discount">${icon('percent')}<span>Discount all</span></button>
        </div>
        <button class="btn small" data-act="revert-lines">${icon('undo')}<span>Revert all to original prices</span></button>
        <p class="muted small">Select a line on the page and tap ${icon('tag')} to see its price history.</p>
        <h4>Document</h4>
        <div class="row2">
          <button class="btn small" data-act="duplicate">${icon('copy')}<span>Duplicate</span></button>
          <button class="btn small danger-ghost" data-act="delete">${icon('trash')}<span>Delete</span></button>
        </div>
      </div>`;
      fillBindings();
      return;
    }
    const d = offer.design;
    panelBody.innerHTML = `<div class="form-stack">
      <h4>Template</h4>
      <div class="tpl-grid">${TEMPLATES.map(([k, n]) => `<button class="tpl-tile tpl-${k} ${d.template === k ? 'active' : ''}" data-tpl="${k}" style="--accent:${esc(d.accent)}">
        <span class="tt-head"></span><span class="tt-line"></span><span class="tt-line"></span><span class="tt-line short"></span><em>${n}</em></button>`).join('')}</div>
      <h4>Layout</h4>
      <div class="seg full">
        ${[1, 2, 3].map((n) => `<button data-columns="${n}" class="${d.columns === n ? 'active' : ''}" title="${n} column${n > 1 ? 's' : ''}">
          <span class="col-icon cols-${n}">${'<i></i>'.repeat(n)}</span>${n} col${n > 1 ? 's' : ''}</button>`).join('')}
      </div>
      ${d.template === 'catalog' ? `<h4>Brand logo</h4>
      <div class="brandlogo-row">
        <div class="logo-prev">${d.brandLogo ? `<img src="${esc(d.brandLogo)}" alt="Brand logo">` : '<span class="muted small">None</span>'}</div>
        <label class="btn small">${icon('upload')}<span>Upload</span><input type="file" accept="image/*" data-brandlogo hidden></label>
        ${d.brandLogo ? `<button class="btn small ghost" data-act="rm-brandlogo">Remove</button>` : ''}
      </div>
      <p class="muted small">Shown under your company logo, e.g. the product brand.</p>` : ''}
      <h4>Accent color</h4>
      <div class="swatches">${SWATCHES.map((c) => `<button class="swatch ${d.accent.toLowerCase() === c ? 'active' : ''}" style="--c:${c}" data-accent="${c}" aria-label="${c}"></button>`).join('')}
        <label class="swatch custom" title="Custom color"><input type="color" data-bind="design.accent" aria-label="Custom color"></label></div>
      <h4>Font</h4>
      <select data-bind="design.font">${Object.keys(FONTS).map((f) => `<option style="font-family:${esc(FONTS[f])}">${esc(f)}</option>`).join('')}</select>
      <h4>Show on page</h4>
      <label class="check"><input type="checkbox" data-bind="design.showLogo"> Company logo</label>
      ${d.template === 'catalog' ? '' : '<label class="check"><input type="checkbox" data-bind="design.showImage"> Product photos</label>'}
      <label class="check"><input type="checkbox" data-bind="design.showCode"> Part code</label>
      <label class="check"><input type="checkbox" data-bind="design.showType"> Product type</label>
      <label class="check"><input type="checkbox" data-bind="design.showBrand"> Brand</label>
      <label class="check"><input type="checkbox" data-bind="design.groupByType"> Group by product type</label>
      <p class="muted small">Company name, logo and footer details are set in <a href="#/settings">Settings</a>.</p>
    </div>`;
    fillBindings();
  }

  function fillBindings() {
    panelBody.querySelectorAll('[data-bind]').forEach((el) => {
      const v = getPath(offer, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = v ?? '';
    });
  }

  function renderPickList() {
    const box = panelBody.querySelector('[data-picklist]');
    if (!box) return;
    const items = filterItems(state.items, pq, ptype)
      .sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.description || '').localeCompare(b.description || ''));
    const inOffer = new Map();
    offer.lines.forEach((l) => l.itemId && inOffer.set(l.itemId, (inOffer.get(l.itemId) || 0) + (Number(l.qty) || 0)));
    panelBody.querySelector('[data-addall]').textContent = `Add all shown (${items.length})`;
    if (!state.items.length) {
      box.innerHTML = `<div class="empty">The item database is empty. <a href="#/items">Add or import items</a>.</div>`;
      return;
    }
    box.innerHTML = items.slice(0, PICK_LIMIT).map((i) => `<button class="pick ${inOffer.has(i.id) ? 'in' : ''}" data-add="${esc(i.id)}">
        ${i.image ? `<img class="pick-img" src="${esc(i.image)}" alt="" loading="lazy">` : '<span class="pick-img"></span>'}
        <span class="pick-main"><span class="pick-desc">${esc(i.description)}</span>
          <small class="muted">${esc([i.type, i.code, i.brand].filter(Boolean).join(' · '))}</small></span>
        <span class="pick-price">${esc(money(i.price))}</span>
        <span class="pick-add">${inOffer.has(i.id) ? (offer.kind === 'offer' ? `&times;${inOffer.get(i.id)}` : icon('check')) : icon('plus')}</span>
      </button>`).join('')
      + (items.length > PICK_LIMIT ? `<div class="empty">${items.length - PICK_LIMIT} more. Refine the search.</div>` : '')
      + (!items.length ? '<div class="empty">No items match.</div>' : '');
  }

  function addItem(item) {
    const existing = offer.lines.find((l) => l.itemId === item.id);
    if (existing && offer.kind === 'pricelist') {
      toast('Already in this price list');
      select(existing.id, true);
      return;
    }
    if (existing) {
      existing.qty = (Number(existing.qty) || 0) + 1;
      selected = existing.id;
    } else {
      const line = lineFromItem(item);
      offer.lines.push(line);
      selected = line.id;
    }
    renderAll();
    select(selected, !isMobile());
    renderPickList();
    if (isMobile()) toast(`Added: ${item.description}`);
    changed();
  }

  // ---------- events: top bar & panel ----------

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) {
      if (editorEl.classList.contains('sheet-open') && panel === tab.dataset.tab && isMobile()) editorEl.classList.remove('sheet-open');
      else openPanel(tab.dataset.tab);
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act) return handleAction(act);

    const add = t.closest('[data-add]');
    if (add) {
      const item = state.items.find((i) => i.id === add.dataset.add);
      if (item) addItem(item);
      return;
    }
    const kind = t.closest('[data-kind]');
    if (kind && offer.kind !== kind.dataset.kind) {
      const defaults = { offer: 'Quotation', pricelist: 'Price list' };
      if (offer.title === defaults[offer.kind]) offer.title = defaults[kind.dataset.kind];
      offer.kind = kind.dataset.kind;
      renderAll(); renderPanel(); changed();
      return;
    }
    const tpl = t.closest('[data-tpl]');
    if (tpl) {
      const was = offer.design.template;
      offer.design.template = tpl.dataset.tpl;
      if (tpl.dataset.tpl === 'catalog' && was !== 'catalog') Object.assign(offer.design, CATALOG_PRESET);
      renderAll(); renderPanel(); changed();
      return;
    }
    const cols = t.closest('[data-columns]');
    if (cols) { offer.design.columns = Number(cols.dataset.columns); renderAll(); renderPanel(); changed(); return; }
    const accent = t.closest('[data-accent]');
    if (accent) { offer.design.accent = accent.dataset.accent; renderAll(); renderPanel(); changed(); return; }

    const sel = t.closest('[data-sel]');
    if (sel) return lineAction(sel.dataset.sel);

    const z = t.closest('[data-zoom]');
    if (z) {
      const page = host.querySelector('.page');
      const now = Number(page?.style.zoom) || 1;
      if (z.dataset.zoom === 'fit') zoom = 'fit';
      else zoom = Math.min(2, Math.max(0.3, Math.round((now + (z.dataset.zoom === '+' ? 0.1 : -0.1)) * 10) / 10));
      applyZoom();
    }
  });

  async function handleAction(act) {
    if (act === 'close-sheet') { editorEl.classList.remove('sheet-open'); return; }
    if (act === 'rm-brandlogo') { offer.design.brandLogo = ''; renderAll(); renderPanel(); changed(); return; }
    if (act === 'undo') return undo();
    if (act === 'redo') return redo();
    if (act === 'print') {
      save.flush();
      select(null);
      const prev = document.title;
      document.title = [offer.number, offer.title, offer.client.company || offer.client.name].filter(Boolean).join(' ');
      window.print();
      document.title = prev;
      return;
    }
    if (act === 'duplicate') {
      save.flush();
      location.hash = `#/offer/${duplicateOffer(offer)}`;
      toast('Duplicated. You are now editing the copy.');
      return;
    }
    if (act === 'delete') {
      if (await confirmDialog(`Delete "${offer.title || 'Untitled'}" (${offer.number})? This cannot be undone.`)) {
        deleted = true;
        save.cancel();
        store.remove('offers', id);
        location.hash = '#/offers';
        toast('Deleted');
      }
      return;
    }
    if (act === 'add-custom') {
      const line = blankLine();
      offer.lines.push(line);
      selected = line.id;
      renderAll();
      if (isMobile()) editorEl.classList.remove('sheet-open');
      const el = host.querySelector(`[data-line="${line.id}"][data-field="description"]`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
      changed();
      return;
    }
    if (act === 'add-all') {
      const have = new Set(offer.lines.map((l) => l.itemId));
      const items = filterItems(state.items, pq, ptype)
        .filter((i) => !have.has(i.id))
        .sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.description || '').localeCompare(b.description || ''));
      if (!items.length) { toast('Nothing new to add'); return; }
      offer.lines.push(...items.map(lineFromItem));
      renderAll(); renderPickList(); changed();
      toast(`Added ${items.length} item${items.length === 1 ? '' : 's'}`);
      return;
    }
    if (act === 'new-item') {
      openItemForm(ptype ? { type: ptype } : null, { onSaved: (item) => addItem(item) });
      return;
    }
    if (act === 'revert-lines') {
      const changedLines = offer.lines.filter(isPriceChanged);
      if (!changedLines.length) { toast('All lines already have their original price'); return; }
      const ok = await confirmDialog(
        `Set ${changedLines.length} line${changedLines.length === 1 ? '' : 's'} back to the price they were added with? Each change is kept in the line's price history.`,
        { title: 'Revert to original prices', ok: 'Revert', danger: false },
      );
      if (!ok) return;
      changedLines.forEach((l) => setLinePrice(l, originalPrice(l), 'revert'));
      renderAll(); changed();
      toast(`Reverted ${changedLines.length} price${changedLines.length === 1 ? '' : 's'}`);
      return;
    }
    if (act === 'refresh-prices') {
      let n = 0;
      for (const l of offer.lines) {
        const item = l.itemId && state.items.find((i) => i.id === l.itemId);
        if (item && Number(item.price) !== Number(l.price)) { setLinePrice(l, Number(item.price) || 0, 'database'); n++; }
      }
      if (n) { renderAll(); changed(); }
      toast(n ? `Updated ${n} price${n === 1 ? '' : 's'}` : 'All prices are already current');
      return;
    }
    if (act === 'global-discount') {
      const v = window.prompt('Discount % for every line (0 to clear):', '10');
      if (v === null) return;
      const pct = Math.min(100, Math.max(0, parseNum(v)));
      if (offer.kind === 'offer') {
        offer.lines.forEach((l) => { l.discount = pct; });
        offer.design.showDiscount = pct > 0 || offer.design.showDiscount;
      } else {
        // Price lists have no discount column: apply it to the listed prices.
        offer.lines.forEach((l) => setLinePrice(l, round2(l.price * (1 - pct / 100)), 'bulk', `-${num(pct)}%`));
      }
      renderAll(); renderPanel(); changed();
    }
  }

  const onPanelInput = (e) => {
    const t = e.target;
    if (t.matches('[data-pq]')) { pq = t.value; renderPickList(); return; }
    if (t.matches('[data-ptype]')) { ptype = t.value; renderPickList(); return; }
    const bind = t.dataset.bind;
    if (!bind) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.hasAttribute('data-num')) v = parseNum(v);
    if (t.hasAttribute('data-upper')) v = String(v).toUpperCase();
    setPath(offer, bind, v);
    renderAll();
    changed();
  };
  panelBody.addEventListener('input', onPanelInput);
  panelBody.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-brandlogo]')) return;
    const file = e.target.files[0];
    if (!file) return;
    try {
      offer.design.brandLogo = await imageToDataURL(file, 480);
      renderAll(); renderPanel(); changed();
    } catch (err) { toast(err.message, 'error'); }
  });

  titleIn.addEventListener('input', () => {
    offer.title = titleIn.value;
    const el = host.querySelector('[data-edit=title]');
    if (el && document.activeElement !== el) el.textContent = offer.title;
    changed();
  });

  // ---------- events: in-place editing on the page ----------

  host.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t.matches('input[data-fmt]')) {
      const l = offer.lines.find((x) => x.id === t.dataset.line);
      if (l) t.value = String(Number(l[t.dataset.field]) || 0);
      if (l && t.dataset.field === 'price') t.dataset.before = String(Number(l.price) || 0);
      t.select();
    }
    const row = t.closest('[data-row]');
    if (row) select(row.dataset.row);
  });

  host.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t.matches('input[data-fmt]')) {
      const l = offer.lines.find((x) => x.id === t.dataset.line);
      if (!l) return;
      if (t.dataset.field === 'price' && t.dataset.before !== undefined) {
        const before = Number(t.dataset.before);
        delete t.dataset.before;
        if (round2(before) !== round2(l.price)) {
          const now = round2(l.price);
          const base = l.priceHistory?.length ? l : { ...l, price: before };
          if (!l.priceHistory?.length && !l.itemId && !before) Object.assign(l, withInitialPrice({ ...l, price: now }));
          else Object.assign(l, withPrice(base, now, 'document'));
          syncSelection();
          changed();
        }
      }
      t.value = formatField(t.dataset.fmt, l[t.dataset.field]);
      return;
    }
    if (t.isContentEditable) {
      const text = t.innerText.replace(/ /g, ' ').trim();
      if (!text) t.innerHTML = '';
      commitText(t, text);
    }
  });

  function commitText(el, text) {
    if (el.dataset.edit) {
      setPath(offer, el.dataset.edit, text);
      if (el.dataset.edit === 'title') titleIn.value = text;
    } else if (el.dataset.line) {
      const l = offer.lines.find((x) => x.id === el.dataset.line);
      if (l) l[el.dataset.field] = text;
    }
    changed();
  }

  host.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('input[data-fmt]')) {
      const l = offer.lines.find((x) => x.id === t.dataset.line);
      if (!l) return;
      let v = parseNum(t.value);
      if (t.dataset.field === 'discount') v = Math.min(100, Math.max(0, v));
      l[t.dataset.field] = v;
      updateTotals();
      changed();
      return;
    }
    if (t.isContentEditable) commitText(t, t.innerText.replace(/ /g, ' ').replace(/\n$/, ''));
  });

  host.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && (t.hasAttribute('data-single') || t.matches('input'))) {
      e.preventDefault();
      t.blur();
    }
    if (e.key === 'Escape') t.blur();
  });

  host.addEventListener('paste', (e) => {
    if (!e.target.isContentEditable) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, e.target.hasAttribute('data-single') ? text.replace(/\s*\n\s*/g, ' ') : text);
  });

  canvas.addEventListener('click', (e) => {
    const row = e.target.closest('[data-row]');
    if (row) select(row.dataset.row);
    else if (!e.target.closest('.sel-bar')) select(null);
  });

  const onKey = (e) => {
    const editing = e.target.closest?.('input, textarea, select, [contenteditable=true]');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !editing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !editing) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); handleAction('print'); return; }
    if (editing || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') select(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); lineAction('del'); }
    if (e.key === 'ArrowUp' && e.altKey && selected) { e.preventDefault(); lineAction('up'); }
    if (e.key === 'ArrowDown' && e.altKey && selected) { e.preventDefault(); lineAction('down'); }
  };
  document.addEventListener('keydown', onKey);
  const onHide = () => save.flush();
  window.addEventListener('pagehide', onHide);

  // ---------- load ----------

  function tryLoad() {
    const src = state.offers.find((o) => o.id === id) || state.pending.get(id);
    if (src) {
      offer = normalizeOffer({ ...structuredClone(src), id });
      state.pending.delete(id);
      history = [snap()];
      renderAll();
      renderPanel();
      setSaveState('saved');
      updateUndo();
      if (isMobile() && !offer.lines.length) editorEl.classList.add('sheet-open');
      return true;
    }
    if (state.loaded.offers) {
      host.innerHTML = '<div class="empty big"><h3>Not found</h3><p>This document was deleted or the link is wrong.</p><a class="btn" href="#/offers">Back to offers</a></div>';
      return true;
    }
    return false;
  }

  let unsub = null;
  // The editor owns its working copy; later snapshots of this offer are our own echoes.
  if (!tryLoad()) unsub = onChange((w) => { if (w === 'offers' && tryLoad()) { unsub(); unsub = null; } });
  const unsubItems = onChange((w) => {
    if (!offer) return;
    if (w === 'items') {
      if (panel === 'items') renderPickList();
      renderAll();
    }
    if (w === 'settings') renderAll();
  });

  return () => {
    save.flush();
    unsub?.();
    unsubItems();
    ro.disconnect();
    pageStyle.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', onHide);
  };
}
