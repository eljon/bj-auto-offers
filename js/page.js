// Renders an offer / price list as an A4 "canvas" page.
// interactive=true adds inline editing hooks used by the editor; false is used for thumbnails.
import { esc, money, num, fmtDate, addDays } from './ui.js';
import { FONTS, KIND_LABEL, TEMPLATES, lineTotal, totals } from './model.js';

const TEMPLATE_KEYS = TEMPLATES.map(([k]) => k);

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

export function formatField(fmt, value) {
  if (fmt === 'money') return money(value);
  if (fmt === 'pct') return `${num(value)}%`;
  return num(value);
}

/** Map of item id to photo, so offer lines show the current item photo without copying it. */
export const imageMap = (items) => Object.fromEntries(items.filter((i) => i.image).map((i) => [i.id, i.image]));

export function renderPage(o, s, { interactive = false, selected = null, images = {} } = {}) {
  const d = o.design;
  const tpl = TEMPLATE_KEYS.includes(d.template) ? d.template : 'classic';
  const catalog = tpl === 'catalog';
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
    const text = formatField(fmt, l[field]);
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
  const showImg = catalog || d.showImage;

  // ----- header -----
  const meta = [['No.', esc(o.number)], ['Date', esc(fmtDate(o.date))]];
  if (isOffer && Number(o.validDays) > 0) meta.push(['Valid until', esc(fmtDate(addDays(o.date, o.validDays)))]);
  const logo = d.showLogo && s.logo ? `<img class="pg-logo" src="${esc(s.logo)}" alt="">` : '';
  const brandLogo = d.brandLogo ? `<img class="pg-brandlogo" src="${esc(d.brandLogo)}" alt="">` : '';
  const head = catalog ? `<header class="cat-head">
    <div class="cat-band"></div>
    <div class="cat-logos">${logo || `<div class="pg-company">${esc(c.name)}</div>`}${brandLogo}</div>
  </header>` : `<header class="pg-head">
    <div class="pg-brand">${logo}
      <div><div class="pg-company">${esc(c.name)}</div>${c.tagline ? `<div class="pg-tagline">${esc(c.tagline)}</div>` : ''}</div>
    </div>
    <div class="pg-meta">
      <div class="pg-kind">${KIND_LABEL[o.kind]}</div>
      <dl>${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    </div>
  </header>`;

  const intro = `<section class="pg-intro">
    ${ed('title', o.title, 'Title', 'pg-title', true)}
    ${catalog && isOffer ? `<div class="cat-meta">${meta.map(([k, v]) => `${k} <b>${v}</b>`).join(' &middot; ')}</div>` : ''}
    ${ed('intro', o.intro, 'Add an introduction (optional)', 'pg-intro-text')}
  </section>`;

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

  let lines = '';
  if (!o.lines.length) {
    // Empty state is shared by every template.
    lines = interactive
      ? `<div class="pg-empty ed-only">Add parts from the <b>Items</b> panel to build this ${KIND_LABEL[o.kind].toLowerCase()}.</div>`
      : '';
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
  } else if (d.layout === 'cards') {
    const card = (l) => `<div class="pg-card${selCls(l)}" data-row="${l.id}">
        <div class="pc-top">${d.showType && !d.groupByType && l.type ? `<span class="pc-type">${esc(l.type)}</span>` : '<span></span>'}
          ${d.showCode ? led(l, 'code', 'Code', 'pc-code', true) : ''}</div>
        ${showImg ? photo(l, 'pc-photo') : ''}
        ${led(l, 'description', 'Description', 'pc-desc')}
        ${d.showBrand && l.brand ? `<div class="sub">${esc(l.brand)}</div>` : ''}
        <div class="pc-bottom">
          ${isOffer ? `<div class="pc-qty">${lnum(l, 'qty', 'qty')}<span>&times;</span></div>` : ''}
          <div class="pc-price">${lnum(l, 'price', 'money')}<span class="pc-unit">/ ${esc(l.unit || 'pcs')}</span></div>
        </div>
        ${isOffer ? `<div class="pc-total"><span>${showDisc && Number(l.discount) ? `-${num(l.discount)}%` : 'Total'}</span><b data-lt="${l.id}">${esc(money(lineTotal(l)))}</b></div>` : ''}
      </div>`;
    lines = `<section class="pg-cards">${groups.map((g) =>
      (g.type ? `<h3 class="pg-group">${esc(g.type)}</h3>` : '') + `<div class="pg-card-grid">${g.lines.map(card).join('')}</div>`,
    ).join('')}</section>`;
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

  // ----- totals, notes, footer -----
  const t = totals(o);
  const sums = isOffer && o.lines.length
    ? `<section class="pg-totals">
        ${d.showVat ? `<div><span>Subtotal</span><b data-t="subtotal">${esc(money(t.subtotal))}</b></div>
        <div><span>VAT ${esc(num(o.vatRate))}%</span><b data-t="vat">${esc(money(t.vat))}</b></div>` : ''}
        <div class="grand"><span>Total</span><b data-t="total">${esc(money(t.total))}</b></div>
      </section>`
    : '';
  const priceNote = !isOffer && o.lines.length && (!catalog || d.showVat)
    ? `<p class="pg-pricenote">Prices in pesos${d.showVat ? `, excluding ${esc(num(o.vatRate))}% VAT` : ''}.</p>`
    : '';

  const notes = interactive || String(o.notes || '').trim()
    ? `<section class="pg-notes"><div class="pg-label">Terms &amp; notes</div>${ed('notes', o.notes, 'Payment terms, delivery, warranty', 'pg-notes-text')}</section>`
    : '';

  const foot = [c.name, (c.address || '').replace(/\s*\n\s*/g, ', '), c.phone, c.email, c.website, c.taxId ? `VAT ID ${c.taxId}` : '']
    .filter((x) => String(x || '').trim());

  const accent = HEX.test(d.accent) ? d.accent : '#e4572e';
  const font = FONTS[d.font] || FONTS.Inter;

  return `<div class="page tpl-${tpl}${interactive ? ' interactive' : ''}" style="--accent:${accent};--pfont:${esc(font)}">
    ${head}${intro}${client}
    <div class="pg-lines">${lines}</div>
    ${sums}${priceNote}${notes}
    <footer class="pg-foot">${foot.map(esc).join(' &middot; ')}</footer>
  </div>`;
}
