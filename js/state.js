// In-memory app state, fed by live store subscriptions.

export const DEFAULT_SETTINGS = {
  company: {
    name: 'BJ Auto',
    tagline: 'Auto parts & accessories',
    address: '',
    phone: '',
    email: '',
    website: '',
    taxId: '',
  },
  logo: '',
  currency: 'PHP',
  vatRate: 12,
  numberPrefix: 'OF-',
  nextNumber: 1,
  template: 'classic',
  accent: '#e4572e',
  font: 'Inter',
  terms: 'Prices are valid for 30 days from the date of this offer.\nDelivery: 2 to 5 working days unless stated otherwise.',
};

export const mergeSettings = (doc = {}) => ({
  ...DEFAULT_SETTINGS,
  ...doc,
  company: { ...DEFAULT_SETTINGS.company, ...(doc.company || {}) },
});

export const state = {
  user: null,
  items: [],
  offers: [],
  settings: mergeSettings(),
  loaded: { items: false, offers: false, meta: false },
  // Offers created this session, readable by the editor before the first snapshot arrives.
  pending: new Map(),
};

const listeners = new Set();
export const onChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const emit = (what) => listeners.forEach((fn) => fn(what));

export const itemTypes = () =>
  [...new Set(state.items.map((i) => (i.type || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
