// Company profile, defaults for new documents, account and backups.
import * as store from '../store.js';
import { state, mergeSettings, onChange } from '../state.js';
import { esc, icon, toast, parseNum, imageToDataURL, download, readFile, confirmDialog } from '../ui.js';
import { FONTS, TEMPLATES, SWATCHES } from '../model.js';

export function mount(root) {
  let logo = state.settings.logo;
  let dirty = false;

  const render = () => {
    const s = state.settings;
    const c = s.company;
    const u = state.user;
    root.innerHTML = `<div class="page-wrap narrow">
      <div class="view-head"><div><h1>Settings</h1><p class="muted">Shown on every offer and price list.</p></div></div>

      ${store.isFirebase ? '' : `<div class="notice">${icon('file')}<div><b>Local demo mode.</b> Data is saved in this browser only.
        To store everything in Firestore and use it on all your devices, fill in <code>js/config.js</code> (see README).</div></div>`}

      <form class="settings-form" data-form>
        <section class="card">
          <h2>Company</h2>
          <div class="form-grid">
            <label>Company name<input name="name" value="${esc(c.name)}"></label>
            <label>Tagline<input name="tagline" value="${esc(c.tagline)}"></label>
            <label class="span2">Address<textarea name="address" rows="2">${esc(c.address)}</textarea></label>
            <label>Phone<input name="phone" type="tel" value="${esc(c.phone)}"></label>
            <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
            <label>Website<input name="website" value="${esc(c.website)}"></label>
            <label>VAT / tax ID<input name="taxId" value="${esc(c.taxId)}"></label>
          </div>
          <div class="logo-row">
            <div class="logo-prev" data-logo-prev>${logo ? `<img src="${esc(logo)}" alt="Logo">` : '<span class="muted small">No logo</span>'}</div>
            <label class="btn">${icon('upload')}<span>Upload logo</span><input type="file" accept="image/*" data-logo hidden></label>
            <button type="button" class="btn ghost" data-act="rm-logo" ${logo ? '' : 'hidden'}>Remove</button>
          </div>
        </section>

        <section class="card">
          <h2>Defaults for new documents</h2>
          <div class="form-grid">
            <label>VAT %<input name="vatRate" inputmode="decimal" value="${esc(s.vatRate)}"></label>
            <label>Number prefix<input name="numberPrefix" value="${esc(s.numberPrefix)}"></label>
            <label>Next number<input name="nextNumber" inputmode="numeric" value="${esc(s.nextNumber)}"></label>
            <label>Template<select name="template">${TEMPLATES.map(([k, n]) => `<option value="${k}" ${k === s.template ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label>Font<select name="font">${Object.keys(FONTS).map((f) => `<option ${f === s.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
            <div class="field span2"><span>Accent color</span>
              <span class="swatches">${SWATCHES.map((col) => `<button type="button" class="swatch ${col === s.accent ? 'active' : ''}" style="--c:${col}" data-accent="${col}" aria-label="${col}"></button>`).join('')}
              <span class="swatch custom"><input type="color" name="accent" value="${esc(s.accent)}" aria-label="Custom color"></span></span></div>
            <label class="span2">Default terms &amp; notes<textarea name="terms" rows="4">${esc(s.terms)}</textarea></label>
          </div>
        </section>
        <div class="sticky-save"><button class="btn primary" type="submit">${icon('check')}<span>Save settings</span></button></div>
      </form>

      <section class="card">
        <h2>Brands</h2>
        <p class="muted">Brand logos you can put on any offer or price list (Design tab).</p>
        <div class="brand-list">${state.brands.map((b) => `<div class="brand-row">
            <div class="logo-prev">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : '<span class="muted small">No logo</span>'}</div>
            <b>${esc(b.name)}</b>
            <label class="btn small">${icon('upload')}<span>Logo</span><input type="file" accept="image/*" data-brand-logo="${esc(b.id)}" hidden></label>
            <button class="icon-btn" data-brand-del="${esc(b.id)}" title="Delete brand" aria-label="Delete brand">${icon('trash')}</button>
          </div>`).join('') || '<p class="muted small">No brands yet.</p>'}</div>
        <div class="brand-add"><input data-brand-name placeholder="Brand name, e.g. Autoline"><button class="btn" data-act="brand-add">${icon('plus')}<span>Add brand</span></button></div>
      </section>

      <section class="card">
        <h2>Account &amp; data</h2>
        <p class="muted">${store.isFirebase && !store.usesSignIn
          ? 'Data is stored in Cloud Firestore. Sign-in is turned off, so anyone with the link can view and edit.'
          : store.isFirebase
          ? `Signed in as <b>${esc(u?.email || u?.displayName || '')}</b>. Data is stored in Cloud Firestore.`
          : 'Data is stored in this browser (localStorage).'}</p>
        <div class="actions wrap">
          <button class="btn" data-act="backup">${icon('download')}<span>Download backup (JSON)</span></button>
          <label class="btn">${icon('upload')}<span>Restore backup</span><input type="file" accept=".json,application/json" data-restore hidden></label>
          ${store.usesSignIn ? `<button class="btn ghost" data-act="signout">${icon('logout')}<span>Sign out</span></button>` : ''}
        </div>
      </section>
    </div>`;
  };

  render();

  root.addEventListener('input', (e) => { if (e.target.closest('form')) dirty = true; });
  root.addEventListener('click', async (e) => {
    const acc = e.target.closest('[data-accent]');
    if (acc) {
      root.querySelector('[name=accent]').value = acc.dataset.accent;
      root.querySelectorAll('[data-accent]').forEach((b) => b.classList.toggle('active', b === acc));
      dirty = true;
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rm-logo') {
      logo = '';
      root.querySelector('[data-logo-prev]').innerHTML = '<span class="muted small">No logo</span>';
      e.target.closest('[data-act]').hidden = true;
      dirty = true;
    }
    if (act === 'signout') store.signOut();
    if (act === 'brand-add') {
      const input = root.querySelector('[data-brand-name]');
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      store.add('meta', { kind: 'brand', name, logo: '', createdAt: Date.now() });
      toast(`Brand "${name}" added. Upload its logo next.`);
    }
    const del = e.target.closest('[data-brand-del]');
    if (del) {
      const b = state.brands.find((x) => x.id === del.dataset.brandDel);
      if (b && (await confirmDialog(`Delete the brand "${b.name}"? Documents using its logo will no longer show it.`))) store.remove('meta', b.id);
    }
    if (act === 'backup') {
      const data = { app: 'bj-auto-offers', version: 1, exportedAt: new Date().toISOString(), settings: state.settings, items: state.items, offers: state.offers, brands: state.brands };
      download(`bj-auto-offers-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
    }
  });

  root.addEventListener('change', async (e) => {
    if (e.target.matches('[data-logo]')) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        logo = await imageToDataURL(file);
        root.querySelector('[data-logo-prev]').innerHTML = `<img src="${esc(logo)}" alt="Logo">`;
        root.querySelector('[data-act=rm-logo]').hidden = false;
        dirty = true;
        toast('Logo ready. Save settings to apply it.');
      } catch (err) {
        toast(err.message, 'error');
      }
    }
    if (e.target.matches('[data-brand-logo]')) {
      const file = e.target.files[0];
      const b = state.brands.find((x) => x.id === e.target.dataset.brandLogo);
      if (!file || !b) return;
      try {
        const { id, ...rest } = b;
        store.set('meta', id, { ...rest, kind: 'brand', logo: await imageToDataURL(file, 480) });
        toast('Brand logo saved');
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (e.target.matches('[data-restore]')) {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try { data = JSON.parse(await readFile(file)); } catch { toast('That file is not a valid backup', 'error'); return; }
      if (!Array.isArray(data.items) || !Array.isArray(data.offers)) { toast('That file is not a valid backup', 'error'); return; }
      const ok = await confirmDialog(
        `Restore ${data.items.length} items and ${data.offers.length} offers? Records with the same id are overwritten, others are kept.`,
        { title: 'Restore backup', ok: 'Restore', danger: false },
      );
      if (!ok) return;
      const entries = (list) => list.map(({ id, ...rest }) => ({ id, data: rest }));
      await store.setMany('items', entries(data.items));
      await store.setMany('offers', entries(data.offers));
      if (Array.isArray(data.brands)) await store.setMany('meta', entries(data.brands.map((b) => ({ ...b, kind: 'brand' }))));
      if (data.settings) await store.set('meta', 'settings', mergeSettings(data.settings));
      toast('Backup restored');
    }
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const next = mergeSettings({
      ...state.settings,
      company: { name: f.name, tagline: f.tagline, address: f.address, phone: f.phone, email: f.email, website: f.website, taxId: f.taxId },
      logo,
      currency: 'PHP',
      vatRate: parseNum(f.vatRate),
      numberPrefix: f.numberPrefix,
      nextNumber: Math.max(1, Math.floor(parseNum(f.nextNumber)) || 1),
      template: f.template,
      font: f.font,
      accent: f.accent,
      terms: f.terms,
    });
    store.set('meta', 'settings', next);
    dirty = false;
    toast('Settings saved');
  });

  // Re-render on remote changes only when nothing is being edited here.
  return onChange((w) => {
    if ((w === 'settings' || w === 'brands') && !dirty) { logo = state.settings.logo; render(); }
  });
}
