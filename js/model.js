// Offer / price list document shape and calculations.
import * as store from './store.js';
import { state } from './state.js';
import { todayISO, round2 } from './ui.js';

export const KIND_LABEL = { offer: 'Offer', pricelist: 'Price list' };
export const STATUSES = ['draft', 'sent', 'accepted', 'rejected'];

export const FONTS = {
  Inter: "'Inter', system-ui, sans-serif",
  Poppins: "'Poppins', system-ui, sans-serif",
  'Roboto Condensed': "'Roboto Condensed', 'Arial Narrow', sans-serif",
  'Playfair Display': "'Playfair Display', Georgia, serif",
};

export const TEMPLATES = [
  ['classic', 'Classic'],
  ['bold', 'Bold'],
  ['minimal', 'Minimal'],
];

export const SWATCHES = ['#e4572e', '#d92d20', '#f79009', '#12b76a', '#0e9384', '#1570ef', '#2e3a8c', '#7a5af8', '#c11574', '#1d2939'];

export const DEFAULT_DESIGN = {
  template: 'classic',
  accent: '#e4572e',
  font: 'Inter',
  layout: 'table',
  showCode: true,
  showType: true,
  showBrand: true,
  showDiscount: false,
  showVat: true,
  groupByType: false,
  showClient: true,
  showLogo: true,
};

export const lineTotal = (l) => (Number(l.price) || 0) * (Number(l.qty) || 0) * (1 - (Number(l.discount) || 0) / 100);

export function totals(o) {
  const subtotal = round2(o.lines.reduce((s, l) => s + lineTotal(l), 0));
  const vat = o.design.showVat ? round2((subtotal * (Number(o.vatRate) || 0)) / 100) : 0;
  return { subtotal, vat, total: round2(subtotal + vat) };
}

export function normalizeOffer(o) {
  return {
    ...o,
    kind: o.kind === 'pricelist' ? 'pricelist' : 'offer',
    client: { name: '', company: '', details: '', ...(o.client || {}) },
    lines: (o.lines || []).map((l) => ({ qty: 1, discount: 0, unit: 'pcs', ...l, id: l.id || store.uid() })),
    design: { ...DEFAULT_DESIGN, ...(o.design || {}) },
  };
}

export function lineFromItem(item) {
  return {
    id: store.uid(),
    itemId: item.id || null,
    type: item.type || '',
    code: item.code || '',
    brand: item.brand || '',
    description: item.description || '',
    unit: item.unit || 'pcs',
    price: Number(item.price) || 0,
    qty: 1,
    discount: 0,
  };
}

export const blankLine = () => lineFromItem({});

export function newOffer(kind) {
  const s = state.settings;
  const isOffer = kind === 'offer';
  return {
    kind,
    title: isOffer ? 'Quotation' : 'Price list',
    number: '',
    date: todayISO(),
    validDays: 30,
    intro: isOffer ? 'Thank you for your inquiry. We are pleased to offer you the following parts:' : '',
    client: { name: '', company: '', details: '' },
    lines: [],
    notes: s.terms || '',
    currency: s.currency || 'EUR',
    vatRate: Number(s.vatRate) || 0,
    status: 'draft',
    total: 0,
    design: {
      ...DEFAULT_DESIGN,
      template: s.template,
      accent: s.accent,
      font: s.font,
      showVat: isOffer,
      showClient: isOffer,
      groupByType: !isOffer,
    },
  };
}

/** Stores a new offer with the next document number and returns its id. */
export function createOffer(data) {
  const s = state.settings;
  const n = Number(s.nextNumber) || 1;
  const now = Date.now();
  const offer = {
    ...data,
    number: `${s.numberPrefix || ''}${new Date().getFullYear()}-${String(n).padStart(4, '0')}`,
    createdAt: now,
    updatedAt: now,
  };
  const id = store.add('offers', offer);
  state.pending.set(id, offer);
  store.set('meta', 'settings', { ...s, nextNumber: n + 1 });
  return id;
}

export function duplicateOffer(src) {
  const { id, ...rest } = normalizeOffer(src);
  return createOffer({
    ...structuredClone(rest),
    title: `${src.title || 'Untitled'} (copy)`,
    status: 'draft',
    date: todayISO(),
    lines: rest.lines.map((l) => ({ ...l, id: store.uid() })),
  });
}
