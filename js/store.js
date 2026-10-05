// Data layer. Uses Cloud Firestore when js/config.js is filled in, otherwise localStorage.
// Every collection holds plain JSON documents; timestamps are epoch milliseconds.
import { firebaseConfig, requireSignIn } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export const isFirebase = Boolean(firebaseConfig?.apiKey) && !firebaseConfig.apiKey.startsWith('YOUR_');
export const usesSignIn = isFirebase && requireSignIn !== false;

let fb = null;
let impl = null;
let errorHandler = (e) => console.error(e);

export const setErrorHandler = (fn) => { errorHandler = fn; };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Firestore rejects `undefined`; a JSON round trip also drops functions and DOM refs.
const clean = (data) => JSON.parse(JSON.stringify(data));

// ---------- localStorage backend ----------

const local = {
  listeners: {},
  key: (col) => 'bjao:' + col,
  read(col) {
    try { return JSON.parse(localStorage.getItem(this.key(col))) || {}; } catch { return {}; }
  },
  list(col) {
    return Object.entries(this.read(col)).map(([id, v]) => ({ ...v, id }));
  },
  write(col, all) {
    try {
      localStorage.setItem(this.key(col), JSON.stringify(all));
    } catch (e) {
      errorHandler(Object.assign(e, { message: 'Browser storage is full. Remove the logo or old offers.' }));
      throw e;
    }
    this.emit(col);
  },
  emit(col) {
    const list = this.list(col);
    (this.listeners[col] || []).forEach((cb) => cb(list));
  },
  subscribe(col, cb) {
    const arr = (this.listeners[col] ||= []);
    arr.push(cb);
    cb(this.list(col));
    return () => arr.splice(arr.indexOf(cb), 1);
  },
  add(col, data) {
    const id = uid();
    const all = this.read(col);
    all[id] = clean(data);
    this.write(col, all);
    return { id, done: Promise.resolve() };
  },
  async set(col, id, data) {
    const all = this.read(col);
    all[id] = clean(data);
    this.write(col, all);
  },
  async remove(col, id) {
    const all = this.read(col);
    delete all[id];
    this.write(col, all);
  },
  async setMany(col, entries) {
    const all = this.read(col);
    for (const { id, data } of entries) all[id || uid()] = clean(data);
    this.write(col, all);
  },
};

window.addEventListener('storage', (e) => {
  if (impl === local && e.key?.startsWith('bjao:')) local.emit(e.key.slice(5));
});

// ---------- Firestore backend ----------

const remote = {
  subscribe(col, cb, onError) {
    const { f, db } = fb;
    return f.onSnapshot(
      f.collection(db, col),
      (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      (e) => (onError || errorHandler)(e),
    );
  },
  add(col, data) {
    const { f, db } = fb;
    const ref = f.doc(f.collection(db, col));
    // The local cache applies the write immediately; the promise settles on server ack.
    return { id: ref.id, done: f.setDoc(ref, clean(data)) };
  },
  set(col, id, data) {
    const { f, db } = fb;
    return f.setDoc(f.doc(db, col, id), clean(data));
  },
  remove(col, id) {
    const { f, db } = fb;
    return f.deleteDoc(f.doc(db, col, id));
  },
  async setMany(col, entries) {
    const { f, db } = fb;
    for (let i = 0; i < entries.length; i += 400) {
      const batch = f.writeBatch(db);
      for (const { id, data } of entries.slice(i, i + 400)) {
        const ref = id ? f.doc(db, col, id) : f.doc(f.collection(db, col));
        batch.set(ref, clean(data));
      }
      await batch.commit();
    }
  },
};

async function loadFirebase() {
  const [appM, authM, fsM] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  let db;
  try {
    // Offline cache: lists load instantly and edits survive a flaky mobile connection.
    db = fsM.initializeFirestore(app, {
      localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }),
    });
  } catch {
    db = fsM.getFirestore(app);
  }
  fb = { app, auth, db, a: authM, f: fsM };
}

// ---------- public API ----------

export async function init() {
  if (isFirebase) {
    await loadFirebase();
    impl = remote;
  } else {
    impl = local;
  }
}

export function onUser(cb) {
  if (!isFirebase) {
    cb({ displayName: 'Local mode', email: '', local: true });
    return () => {};
  }
  if (!usesSignIn) {
    cb({ displayName: 'Open access', email: '', open: true });
    return () => {};
  }
  return fb.a.onAuthStateChanged(fb.auth, cb);
}

export async function signIn() {
  const provider = new fb.a.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.a.signInWithPopup(fb.auth, provider);
  } catch (e) {
    const usesRedirect = ['auth/popup-blocked', 'auth/operation-not-supported-in-environment', 'auth/cancelled-popup-request'];
    if (usesRedirect.includes(e.code)) await fb.a.signInWithRedirect(fb.auth, provider);
    else if (e.code !== 'auth/popup-closed-by-user') throw e;
  }
}

export async function signOut() {
  if (usesSignIn) await fb.a.signOut(fb.auth);
}

const guard = (p) => {
  Promise.resolve(p).catch((e) => errorHandler(e));
  return p;
};

export const subscribe = (col, cb, onError) => impl.subscribe(col, cb, onError);

/** Creates a document and returns its id synchronously. */
export function add(col, data) {
  const { id, done } = impl.add(col, data);
  guard(done);
  return id;
}

export const set = (col, id, data) => guard(impl.set(col, id, data));
export const remove = (col, id) => guard(impl.remove(col, id));
/** entries: [{ id?, data }]. Missing ids create new documents. */
export const setMany = (col, entries) => guard(impl.setMany(col, entries));
