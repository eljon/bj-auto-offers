// Renders an offer / price list as an A4 "canvas" page.
// interactive=true adds inline editing hooks used by the editor; false is used for thumbnails.
import { esc, money, num, fmtDate, addDays } from './ui.js';
import { FONTS, KIND_LABEL, TEMPLATES, lineTotal, totals, pricingLabel } from './model.js';

const TEMPLATE_KEYS = TEMPLATES.map(([k]) => k);
// Flyer-style templates with their own header and row styling.
const DESIGNED = ['catalog', 'banner', 'showcase', 'wave', 'burst', 'drip'];

const HEX = /^#[0-9a-f]{6}$/i;

export function groupLines(lines, byType) {
  if (!byType) return [{ type: null, lines }];
  const groups = new Map();
  for (const l of lines) {
    const k = (l.type || '').trim() || 'Other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  return [...groups].map(([type, ls]) => ({ type, lines: ls }));
}

const priceFmts = new Map();
/** Line price as the design shows it: ₱765.00, ₱765, P765 or 765. */
export function priceText(value, design = {}) {
  const decimals = Number(design.priceDecimals) === 0 ? 0 : 2;
  const symbol = design.priceSymbol ?? '₱';
  let f = priceFmts.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    priceFmts.set(decimals, f);
  }
  return `${symbol}${f.format(Number(value) || 0)}`;
}

export function formatField(fmt, value, design) {
  if (fmt === 'money') return priceText(value, design);
  if (fmt === 'pct') return `${num(value)}%`;
  return num(value);
}

/** Map of item id to photo, so offer lines show the current item photo without copying it. */
export const imageMap = (items) => Object.fromEntries(items.filter((i) => i.image).map((i) => [i.id, i.image]));
/** Map of brand id to logo. */
export const brandMap = (brands) => Object.fromEntries(brands.filter((b) => b.logo).map((b) => [b.id, b.logo]));

export function renderPage(o, s, { interactive = false, selected = null, images = {}, brands = {} } = {}) {
  const d = o.design;
  const tpl = TEMPLATE_KEYS.includes(d.template) ? d.template : 'classic';
  const catalog = tpl === 'catalog';
  const designed = DESIGNED.includes(tpl);
  const isOffer = o.kind === 'offer';
  const c = s.company;

  const editable = (attrs, text, placeholder, cls, single) =>
    `<div class="${cls}" contenteditable="true" spellcheck="false" ${attrs} data-placeholder="${esc(placeholder)}"${single ? ' data-single' : ''}>${esc(text)}</div>`;

  const ed = (field, text, placeholder, cls = '', single = false) => {
    if (interactive) return editable(`data-edit="${field}"`, text, placeholder, cls, single);
    return String(text || '').trim() ? `<div class="${cls}">${esc(text)}</div>` : '';
  };
  const led = (l, field, placeholder, cls = '', single = false) =>
    interactive
      ? editable(`data-line="${l.id}" data-field="${field}"`, l[field], placeholder, cls, single)
      : `<div class="${cls}">${esc(l[field])}</div>`;
  const lnum = (l, field, fmt, cls = '') => {
    const text = formatField(fmt, l[field], d);
    if (!interactive) return `<span class="${cls}">${fmt === 'pct' && !Number(l[field]) ? '' : esc(text)}</span>`;
    return `<input class="num-in ${cls}" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="${field}"
      data-line="${l.id}" data-field="${field}" data-fmt="${fmt}" value="${esc(text)}">`;
  };
  const selCls = (l) => (l.id === selected ? ' is-selected' : '');
  const photo = (l, cls) => {
    const src = l.image || images[l.itemId];
    if (src) return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">`;
    return interactive ? `<div class="${cls} no-img">No photo</div>` : '';
  };
  const showImg = designed || d.showImage;

  // ----- header -----
  const meta = [['No.', esc(o.number)], ['Date', esc(fmtDate(o.date))]];
  if (isOffer && Number(o.validDays) > 0) meta.push(['Valid until', esc(fmtDate(addDays(o.date, o.validDays)))]);
  const metaLine = isOffer ? `<div class="cat-meta">${meta.map(([k, v]) => `${k} <b>${v}</b>`).join(' &middot; ')}</div>` : '';
  const logo = d.showLogo && s.logo ? `<img class="pg-logo" src="${esc(s.logo)}" alt="">` : '';
  const companyMark = logo || `<div class="pg-company">${esc(c.name)}</div>`;
  const brandSrc = d.brandLogo || brands[d.brandId];
  const brandLogo = brandSrc ? `<img class="pg-brandlogo" src="${esc(brandSrc)}" alt="">` : '';
  const hero = d.heroImage ? `<img class="pg-hero" src="${esc(d.heroImage)}" alt="">` : '';
  const pricing = pricingLabel(o);
  const pricingTag = pricing ? `<div class="pg-pricing">${esc(pricing)}</div>` : '';
  const title = ed('title', o.title, 'Title', 'pg-title', true);
  const subtitle = ed('subtitle', o.subtitle, 'Subtitle (optional)', 'pg-subtitle', true);
  const introText = ed('intro', o.intro, 'Add an introduction (optional)', 'pg-intro-text');

  let head;
  let intro;
  if (tpl === 'catalog') {
    head = `<header class="cat-head"><div class="cat-band"></div><div class="cat-logos">${companyMark}${brandLogo}</div></header>`;
    intro = `<section class="pg-intro">${title}${subtitle}${metaLine}${pricingTag}${introText}</section>`;
  } else if (tpl === 'banner') {
    head = `<header class="cat-head"><div class="cat-band"></div><div class="cat-logos">${companyMark}</div>
      ${brandLogo ? `<div class="bn-brand">${brandLogo}</div>` : ''}</header>`;
    intro = `<section class="pg-intro"><div class="bn-bar">${title}</div>${subtitle}${metaLine}
      <div class="bn-offer">${ed('intro', o.intro, 'e.g. NEW ARRIVALS: SPECIAL OFFER:', 'pg-intro-text', true)}${pricingTag}</div></section>`;
  } else if (tpl === 'showcase') {
    head = `<header class="sc-head"><div class="sc-logo">${companyMark}</div>
      ${ed('heading', o.heading, 'Heading, e.g. AUTOLINE PRODUCT LIST', 'sc-heading')}${brandLogo}</header>`;
    intro = `${metaLine}${introText}`;
  } else if (tpl === 'wave') {
    head = `<header class="wv-head"><svg class="wv-svg" viewBox="0 0 800 160" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0H800V70C690 118 560 40 430 70S180 150 0 100Z" fill="#1658c9"/>
        <path d="M0 0H800V46C700 92 560 18 420 48S170 120 0 74Z" fill="#3d86ee"/>
        <path d="M0 0H800V26C700 60 560 0 410 30S170 92 0 50Z" fill="#7fb2f5" opacity=".55"/></svg>
      <div class="wv-logo">${companyMark}</div>${brandLogo}</header>`;
    intro = `<section class="pg-intro">${title}${subtitle}${metaLine}${pricingTag}${introText}</section>`;
  } else if (tpl === 'burst') {
    head = `<header class="bu-head"><span class="bu-dot bu-dot-a"></span><div class="bu-logo">${companyMark}</div></header>`;
    intro = `<section class="pg-intro bu-intro">${hero ? `<div class="bu-hero">${hero}</div>` : ''}
      <div class="bu-titles">${title}${subtitle}${pricingTag}</div>${brandLogo}</section>${metaLine}${introText}`;
  } else if (tpl === 'drip') {
    head = `<header class="dr-head"><svg class="dr-svg dr-tr" viewBox="0 0 200 200" aria-hidden="true">
        <g stroke-linecap="round" fill="none"><path d="M40 -20L190 130" stroke="#b20101" stroke-width="30"/><path d="M90 -20L210 100" stroke="#191919" stroke-width="22"/>
        <path d="M10 10L120 120" stroke="#d0141b" stroke-width="18"/><path d="M130 -10L215 75" stroke="#b20101" stroke-width="16"/></g></svg>
      <div class="dr-logo">${companyMark}</div></header>`;
    intro = `<section class="pg-intro dr-intro">${hero ? `<div class="dr-hero">${hero}</div>` : ''}
      <div class="dr-titles">${title}${subtitle}<span class="dr-dots"></span></div>${pricingTag}${brandLogo}</section>${metaLine}${introText}`;
  } else {
    head = `<header class="pg-head">
      <div class="pg-brand">${logo}
        <div><div class="pg-company">${esc(c.name)}</div>${c.tagline ? `<div class="pg-tagline">${esc(c.tagline)}</div>` : ''}</div>
      </div>
      <div class="pg-meta">
        <div class="pg-kind">${KIND_LABEL[o.kind]}</div>
        <dl>${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      </div>
    </header>`;
    intro = `<section class="pg-intro">${title}${subtitle}${pricingTag}${introText}</section>`;
  }

  const cl = o.client;
  const client = d.showClient && (interactive || cl.name || cl.company || cl.details)
    ? `<section class="pg-client">
        <div class="pg-label">${isOffer ? 'Prepared for' : 'Customer'}</div>
        ${ed('client.company', cl.company, 'Company', 'cl-company', true)}
        ${ed('client.name', cl.name, 'Contact person', 'cl-name', true)}
        ${ed('client.details', cl.details, 'Address, phone, email', 'cl-details')}
      </section>`
    : '';

  // ----- lines -----
  const showDisc = isOffer && d.showDiscount;
  const groups = groupLines(o.lines, d.groupByType);
  const subline = (l) => {
    const parts = [];
    if (d.showType && !d.groupByType && l.type) parts.push(l.type);
    if (d.showBrand && l.brand) parts.push(l.brand);
    return parts.length ? `<div class="sub">${esc(parts.join(' · '))}</div>` : '';
  };

  // 1 column = rows; 2 and 3 columns = tiles. Older documents stored layout 'table' / 'cards'.
  const columns = [1, 2, 3].includes(Number(d.columns)) ? Number(d.columns) : (d.layout === 'cards' ? 3 : 1);
  const label = catalog || designed ? { code: 'Part no.', desc: 'Application' } : { code: 'Code', desc: 'Description' };

  let lines = '';
  if (!o.lines.length) {
    // Empty state is shared by every template.
    lines = interactive
      ? `<div class="pg-empty ed-only">Add parts from the <b>Items</b> panel to build this ${KIND_LABEL[o.kind].toLowerCase()}.</div>`
      : '';
  } else if (columns > 1 || (designed && !catalog)) {
    // Tiles. The flyer templates also use tiles for 1 column (full-width rows styled per template).
    const card = (l) => {
      const img = showImg ? photo(l, 'pc-photo') : '';
      const type = d.showType && !d.groupByType && l.type ? `<span class="pc-type">${esc(l.type)}</span>` : '';
      const code = d.showCode ? led(l, 'code', label.code, 'pc-code', true) : '';
      return `<div class="pg-card${img ? ' has-img' : ''}${selCls(l)}" data-row="${l.id}">
        ${img ? `<div class="pc-media">${img}</div>` : ''}
        <div class="pc-body">
          ${type || code ? `<div class="pc-top">${type}${code}</div>` : ''}
          ${led(l, 'description', label.desc, 'pc-desc')}
          ${d.showBrand && l.brand ? `<div class="sub">${esc(l.brand)}</div>` : ''}
        </div>
        <div class="pc-bottom">
          ${isOffer ? `<div class="pc-qty">${lnum(l, 'qty', 'qty')}<span>&times;</span></div>` : ''}
          <div class="pc-price">${lnum(l, 'price', 'money')}<span class="pc-unit">/ ${esc(l.unit || 'pcs')}</span></div>
        </div>
        ${isOffer ? `<div class="pc-total"><span>${showDisc && Number(l.discount) ? `-${num(l.discount)}%` : 'Total'}</span><b data-lt="${l.id}">${esc(money(lineTotal(l)))}</b></div>` : ''}
      </div>`;
    };
    lines = `<section class="pg-cards">${groups.map((g) =>
      (g.type ? `<h3 class="pg-group">${esc(g.type)}</h3>` : '') + `<div class="pg-grid cols-${columns}">${g.lines.map(card).join('')}</div>`,
    ).join('')}</section>`;
  } else if (catalog) {
    const cols = 4 + (isOffer ? 2 : 0);
    const row = (l) => `<tr data-row="${l.id}"${selCls(l) ? ' class="is-selected"' : ''}>
        <td class="cat-img">${photo(l, 'cat-photo')}</td>
        <td class="cat-code">${led(l, 'code', 'Part no.', '', true)}</td>
        <td class="cat-desc">${led(l, 'description', 'Application')}</td>
        ${isOffer ? `<td class="cat-qty">${lnum(l, 'qty', 'qty')}<span>${esc(l.unit || 'pcs')}</span></td>` : ''}
        <td class="cat-price">${lnum(l, 'price', 'money')}</td>
        ${isOffer ? `<td class="cat-total" data-lt="${l.id}">${esc(money(lineTotal(l)))}</td>` : ''}
      </tr>`;
    lines = `<table class="cat-table"><tbody>${groups.map((g) =>
      (g.type ? `<tr class="cat-grp"><td colspan="${cols}">${esc(g.type)}</td></tr>` : '') + g.lines.map(row).join(''),
    ).join('')}</tbody></table>`;
  } else {
    const cols = 3 + (showImg ? 1 : 0) + (d.showCode ? 1 : 0) + (isOffer ? 2 : 0) + (showDisc ? 1 : 0);
    const row = (l) => `<tr data-row="${l.id}"${selCls(l) ? ' class="is-selected"' : ''}>
        ${showImg ? `<td class="c-img">${photo(l, 'row-photo')}</td>` : ''}
        ${d.showCode ? `<td class="c-code">${led(l, 'code', 'Code', '', true)}</td>` : ''}
        <td class="c-desc">${led(l, 'description', 'Description')}${subline(l)}</td>
        ${isOffer ? `<td class="c-qty num">${lnum(l, 'qty', 'qty')}</td>` : ''}
        <td class="c-unit">${led(l, 'unit', 'unit', '', true)}</td>
        <td class="c-price num">${lnum(l, 'price', 'money')}</td>
        ${showDisc ? `<td class="c-disc num">${lnum(l, 'discount', 'pct')}</td>` : ''}
        ${isOffer ? `<td class="c-total num" data-lt="${l.id}">${esc(money(lineTotal(l)))}</td>` : ''}
      </tr>`;
    lines = `<table class="pg-table">
      <thead><tr>
        ${showImg ? '<th class="c-img"></th>' : ''}
        ${d.showCode ? '<th class="c-code">Code</th>' : ''}
        <th class="c-desc">Description</th>
        ${isOffer ? '<th class="c-qty num">Qty</th>' : ''}
        <th class="c-unit">Unit</th>
        <th class="c-price num">${isOffer ? 'Unit price' : 'Price'}</th>
        ${showDisc ? '<th class="c-disc num">Disc.</th>' : ''}
        ${isOffer ? '<th class="c-total num">Amount</th>' : ''}
      </tr></thead>
      <tbody>${groups.map((g) =>
        (g.type ? `<tr class="grp"><td colspan="${cols}">${esc(g.type)}</td></tr>` : '') + g.lines.map(row).join(''),
      ).join('')}</tbody>
    </table>`;
  }
  if (tpl === 'showcase') {
    // The product card holds the title and the rows, like the coil spring flyer.
    lines = `<section class="sc-card"><div class="sc-titles">${title}${subtitle}${pricingTag}</div>${lines}</section>`;
  }

  // ----- totals, notes, footer -----
  const t = totals(o);
  const sums = isOffer && o.lines.length
    ? `<section class="pg-totals">
        ${d.showVat ? `<div><span>Subtotal</span><b data-t="subtotal">${esc(money(t.subtotal))}</b></div>
        <div><span>VAT ${esc(num(o.vatRate))}%</span><b data-t="vat">${esc(money(t.vat))}</b></div>` : ''}
        <div class="grand"><span>Total</span><b data-t="total">${esc(money(t.total))}</b></div>
      </section>`
    : '';
  const priceNote = !isOffer && o.lines.length && (!designed || d.showVat)
    ? `<p class="pg-pricenote">Prices in pesos${d.showVat ? `, excluding ${esc(num(o.vatRate))}% VAT` : ''}.</p>`
    : '';

  const notes = interactive || String(o.notes || '').trim()
    ? `<section class="pg-notes"><div class="pg-label">Terms &amp; notes</div>${ed('notes', o.notes, 'Payment terms, delivery, warranty', 'pg-notes-text')}</section>`
    : '';

  const foot = [c.name, (c.address || '').replace(/\s*\n\s*/g, ', '), c.phone, c.email, c.website, c.taxId ? `VAT ID ${c.taxId}` : '']
    .filter((x) => String(x || '').trim());
  const deco = {
    wave: `<svg class="wv-svg wv-foot" viewBox="0 0 800 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 120H800V40C690 0 560 80 420 50S170 -10 0 50Z" fill="#1658c9"/>
      <path d="M0 120H800V70C690 30 560 100 420 76S170 30 0 80Z" fill="#3d86ee"/></svg>`,
    burst: '<span class="bu-dot bu-dot-b"></span>',
    drip: `<svg class="dr-svg dr-bl" viewBox="0 0 200 200" aria-hidden="true"><g stroke-linecap="round" fill="none">
      <path d="M-20 60L130 210" stroke="#b20101" stroke-width="30"/><path d="M-20 120L80 220" stroke="#d0141b" stroke-width="18"/>
      <path d="M30 70L150 190" stroke="#191919" stroke-width="10"/></g></svg><span class="dr-dots dr-dots-b"></span><div class="dr-bar"></div>`,
  }[tpl] || '';

  const accent = HEX.test(d.accent) ? d.accent : '#e4572e';
  const font = FONTS[d.font] || FONTS.Inter;

  return `<div class="page tpl-${tpl}${designed ? ' designed' : ''}${interactive ? ' interactive' : ''}" style="--accent:${accent};--pfont:${esc(font)}">
    ${head}${intro}${client}
    <div class="pg-lines">${lines}</div>
    ${sums}${priceNote}${notes}
    <footer class="pg-foot">${foot.map(esc).join(' &middot; ')}</footer>
    ${deco}
  </div>`;
}
