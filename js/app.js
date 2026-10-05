// App shell: auth gate, live data subscriptions and hash router.
import * as store from './store.js';
import { state, emit, mergeSettings } from './state.js';
import { toast, icon, esc } from './ui.js';
import * as offersView from './views/offers.js';
import * as itemsView from './views/items.js';
import * as editorView from './views/editor.js';
import * as settingsView from './views/settings.js';

const routes = [
  { re: /^#\/offers$/, view: offersView, nav: 'offers' },
  { re: /^#\/offer\/([\w-]+)$/, view: editorView, nav: 'editor' },
  { re: /^#\/items$/, view: itemsView, nav: 'items' },
  { re: /^#\/settings$/, view: settingsView, nav: 'settings' },
];

const viewEl = document.getElementById('view');
let cleanup = null;
let unsubs = [];

function route() {
  if (!state.user) return;
  const hash = location.hash || '#/offers';
  const r = routes.find((x) => x.re.test(hash));
  if (!r) { location.replace('#/offers'); return; }
  cleanup?.();
  cleanup = null;
  // Fresh container per route so listeners from the previous view are dropped with it.
  const container = document.createElement('div');
  container.className = 'view';
  viewEl.replaceChildren(container);
  document.body.dataset.route = r.nav;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav || (r.nav === 'editor' && a.dataset.nav === 'offers')));
  cleanup = r.view.mount(container, ...hash.match(r.re).slice(1)) || null;
  window.scrollTo(0, 0);
}

function errorMessage(e) {
  if (e?.code === 'permission-denied') return 'No access to the database. Ask the owner to add your account to the Firestore rules.';
  if (e?.code === 'unavailable') return 'Offline. Changes are kept on this device and synced later.';
  return `Something went wrong: ${e?.message || e}`;
}

function subscribeData() {
  const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  unsubs.push(store.subscribe('items', (list) => {
    state.items = list.sort(byUpdated);
    state.loaded.items = true;
    emit('items');
  }));
  unsubs.push(store.subscribe('offers', (list) => {
    state.offers = list.sort(byUpdated);
    state.loaded.offers = true;
    emit('offers');
  }));
  unsubs.push(store.subscribe('meta', (list) => {
    state.settings = mergeSettings(list.find((d) => d.id === 'settings') || {});
    delete state.settings.id;
    state.loaded.meta = true;
    emit('settings');
  }));
}

function renderUser() {
  const box = document.getElementById('user-box');
  const u = state.user;
  if (!u) { box.innerHTML = ''; return; }
  if (u.open) {
    box.innerHTML = '';
    return;
  }
  if (u.local) {
    box.innerHTML = `<a class="pill warn" href="#/settings" title="Data is stored in this browser only">Local mode</a>`;
    return;
  }
  const initials = (u.displayName || u.email || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  box.innerHTML = `<a class="avatar" href="#/settings" title="${esc(u.email || '')}">${u.photoURL
    ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}</a>`;
}

function showLogin() {
  cleanup?.();
  cleanup = null;
  document.body.dataset.route = 'login';
  viewEl.innerHTML = `<div class="login">
    <div class="login-card">
      <img src="icon.svg" alt="" width="64" height="64">
      <h1>BJ Auto Offers</h1>
      <p class="muted">Sign in to manage your parts, offers and price lists.</p>
      <button class="btn primary lg" data-signin>${icon('user')}<span>Sign in with Google</span></button>
    </div>
  </div>`;
  viewEl.querySelector('[data-signin]').addEventListener('click', async () => {
    try { await store.signIn(); } catch (e) { toast(e.message, 'error'); }
  });
}

async function start() {
  store.setErrorHandler((e) => { console.error(e); toast(errorMessage(e), 'error'); });
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="empty big"><h3>Could not connect</h3><p>Loading Firebase failed. Check your connection and js/config.js.</p></div>`;
    return;
  }
  store.onUser((user) => {
    unsubs.forEach((u) => u());
    unsubs = [];
    state.user = user;
    state.loaded = { items: false, offers: false, meta: false };
    renderUser();
    if (!user) { showLogin(); return; }
    subscribeData();
    route();
  });
}

window.addEventListener('hashchange', route);
start();
