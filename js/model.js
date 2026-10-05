// Offer / price list document shape and calculations.
import * as store from './store.js';
import { state } from './state.js';
import { todayISO, round2, CURRENCY } from './ui.js';
import { withInitialPrice } from './prices.js';

export const KIND_LABEL = { offer: 'Offer', pricelist: 'Price list' };
export const STATUSES = ['draft', 'sent', 'accepted', 'rejected'];

export const FONTS = {
  Inter: "'Inter', system-ui, sans-serif",
  Poppins: "'Poppins', system-ui, sans-serif",
  'Roboto Condensed': "'Roboto Condensed', 'Arial Narrow', sans-serif",
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'League Spartan': "'League Spartan', 'Poppins', sans-serif",
  Oswald: "'Oswald', 'Roboto Condensed', sans-serif",
  Antonio: "'Antonio', 'Oswald', sans-serif",
};

export const TEMPLATES = [
  ['classic', 'Classic'],
  ['bold', 'Bold'],
  ['minimal', 'Minimal'],
  ['catalog', 'Parts Catalog'],
  ['banner', 'Banner List'],
  ['showcase', 'Dark Showcase'],
  ['wave', 'Blue Wave'],
  ['burst', 'Orange Burst'],
  ['drip', 'Red Drip'],
];

// Applied when a flyer template is picked (copied from the BJ Auto flyers they are modeled on).
const FLYER = { showImage: true, showType: false, showBrand: false, groupByType: false, showClient: false };
export const TEMPLATE_PRESETS = {
  catalog: { ...FLYER, font: 'League Spartan', accent: '#1f4ea8', priceSymbol: '₱', priceDecimals: 2 },
  banner: { ...FLYER, font: 'Inter', accent: '#fff200', columns: 2, priceSymbol: '₱', priceDecimals: 0 },
  showcase: { ...FLYER, font: 'Oswald', accent: '#f6c21c', priceSymbol: '₱', priceDecimals: 0 },
  wave: { ...FLYER, font: 'League Spartan', accent: '#4284e6', priceSymbol: '', priceDecimals: 0 },
  burst: { ...FLYER, font: 'Poppins', accent: '#ff7203', priceSymbol: 'P', priceDecimals: 0 },
  drip: { ...FLYER, font: 'Poppins', accent: '#b20101', priceSymbol: '', priceDecimals: 2 },
};
export const CATALOG_PRESET = TEMPLATE_PRESETS.catalog;

export const PRICING_MODES = { none: 'Nothing', net: 'Net price', discount: 'Discount(s)' };
/** The pricing note a document shows. Discounts are display-only and never change the prices. */
export function pricingLabel(o) {
  const p = o.pricing || {};
  if (p.mode === 'net') return p.label || 'NET PRICE';
  if (p.mode === 'discount') {
    const ds = (p.discounts || []).filter((x) => Number(x));
    if (!ds.length) return p.label || '';
    return `${p.label || 'LESS'} ${ds.map((x) => `${x}%`).join(' + ')}`;
  }
  return '';
}

export const SWATCHES = ['#1f4ea8', '#e4572e', '#d92d20', '#f79009', '#12b76a', '#0e9384', '#1570ef', '#2e3a8c', '#7a5af8', '#c11574', '#1d2939'];

export const DEFAULT_DESIGN = {
  template: 'classic',
  accent: '#e4572e',
  font: 'Inter',
  columns: 1,
  showCode: true,
  showType: true,
  showBrand: true,
  showDiscount: false,
  showVat: true,
  groupByType: false,
  showClient: true,
  showLogo: true,
  showImage: false,
  brandLogo: '',
  brandId: '',
  heroImage: '',
  priceSymbol: '₱',
  priceDecimals: 2,
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
    currency: CURRENCY,
    subtitle: o.subtitle || '',
    heading: o.heading || '',
    pricing: { mode: 'none', discounts: [], label: '', ...(o.pricing || {}) },
    client: { name: '', company: '', details: '', ...(o.client || {}) },
    lines: (o.lines || []).map((l) => ({ qty: 1, discount: 0, unit: 'pcs', ...l, id: l.id || store.uid() })),
    design: normalizeDesign(o.design),
  };
}

// Documents saved before the column picker stored layout 'table' or 'cards'.
function normalizeDesign(design = {}) {
  const d = { ...DEFAULT_DESIGN, ...design };
  if (![1, 2, 3].includes(Number(design.columns))) d.columns = design.layout === 'cards' ? 3 : 1;
  d.columns = Number(d.columns);
  delete d.layout;
  return d;
}

export function lineFromItem(item) {
  const line = {
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
  // Lines from the database start their own price history at the price they were added with.
  return item.id ? withInitialPrice(line) : line;
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
    currency: CURRENCY,
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
      ...(TEMPLATE_PRESETS[s.template] || {}),
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
