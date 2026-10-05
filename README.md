# BJ Auto Offers

A web app for building **offers** and **price lists** for auto parts, on top of a shared **item database**
(product type, code, brand, description, unit, price). All prices are in Philippine pesos (₱). Documents are designed on an A4 canvas, edited in place,
and exported to PDF from the browser. Works on desktop and phones, hosted on GitHub Pages, data in Cloud Firestore.

No build step: plain HTML, CSS and JavaScript modules.

## Features

- **Item database** with product photos: search, filter by product type, sort, add/edit/duplicate/delete, CSV import (Excel friendly,
  comma/semicolon/tab, updates existing items by code) and CSV export, bulk price adjustment by percentage with rounding.
- **Canvas editor**: A4 page with zoom, click any text on the page to edit it, edit quantities, prices and
  discounts directly in the table, select a line to move, duplicate, remove, or save it to the database. Undo/redo.
- **Price history**: every price change (edits, CSV imports, bulk adjustments, reverts) is kept with date and
  source, for items in the database and for lines inside each document. "Revert to original price" per item,
  per line, or for all shown items / all lines at once, and any earlier price can be restored from the history.
- **Pricing note** per document (Details > Pricing): show nothing, "NET PRICE", or discounts such as "LESS 10% + 5%".
  Display only: prices are not recalculated.
- **Two document kinds**: offers (quantities, discounts, subtotal, VAT, total, customer block) and price lists
  (grouped by product type, no quantities).
- **Design panel**: Classic, Bold, Minimal plus flyer templates modeled on the BJ Auto offers: **Parts Catalog**,
  **Banner List**, **Dark Showcase**, **Blue Wave**, **Orange Burst** and **Red Drip**; brand logos from a saved brand
  library (Settings > Brands), header image, price format (₱ / P / none, with or without decimals). Templates: (Parts Catalog: slanted header band,
  company and brand logos, slab title, photo table with a colored price column, prints edge to edge), 1, 2 or 3 column layout on every template, accent colors, fonts,
  toggles for logo, codes, types, brands and grouping.
- **PDF / Print**: only the page is printed, A4, with repeating table headers.
- **Settings**: company profile and logo, default VAT, numbering, template and terms, JSON backup and restore.
- Live sync between devices, offline cache (Firestore persistence), optional Google sign-in restricted to an allow list.

## Try it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

With the placeholder `js/config.js`, the app runs in **local demo mode**: data lives in the browser's localStorage
and no sign-in is needed. Use "Load sample parts" on the Items page to try it out.

## Connect Firestore

1. Create a project at <https://console.firebase.google.com>.
2. **Build > Firestore Database > Create database** (production mode, pick a region).
3. **Project settings > General > Your apps**: add a **Web app**, copy its config into `js/config.js`.
   (The web config is not a secret; access is enforced by the security rules.)
4. Paste `firestore.rules` into **Firestore Database > Rules** and publish
   (or `firebase deploy --only firestore:rules`).

`firestore.rules` currently allows open access, matching `requireSignIn = false` in `js/config.js`:
anyone with the link can view and edit. To require Google sign-in:

1. **Authentication > Sign-in method**: enable **Google**; **Authentication > Settings > Authorized domains**:
   add `<your-github-user>.github.io`.
2. Set `requireSignIn = true` in `js/config.js`.
3. Replace each `if true` in the rules with `if isTeam()` and add, inside `match /databases/{database}/documents`:

   ```
   function isTeam() {
     return request.auth != null
       && request.auth.token.email_verified == true
       && request.auth.token.email in ['you@example.com'];
   }
   ```

To move data from demo mode: Settings > Download backup while in demo mode, then Settings > Restore backup after connecting.

## Deploy to GitHub Pages

1. Merge into `main`.
2. Repository **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes the site on every push to `main`
   at `https://<your-github-user>.github.io/bj-auto-offers/`.

## Data model (Firestore)

| Collection | Document | Fields |
| --- | --- | --- |
| `items` | auto id | `type` (item name), `code` (part number), `brand`, `description` (application), `unit`, `price`, `priceHistory[]` (`price`, `at`, `source`, `note`), `image` (JPEG data URL), `createdAt`, `updatedAt` |
| `offers` | auto id | `kind` (`offer` / `pricelist`), `title`, `number`, `date`, `validDays`, `status`, `intro`, `client {company, name, details}`, `lines[]`, `notes`, `currency`, `vatRate`, `design {...}`, `total`, `createdAt`, `updatedAt` |
| `meta` | `settings` | company profile, `logo` (data URL), defaults, `nextNumber` |
| `meta` | brand ids | `kind: 'brand'`, `name`, `logo` (data URL) |

Offer lines copy the item's data when added, so changing a price in the database does not silently change
documents already sent. Photos are not copied: lines show the item's current photo. Use **Details > Update prices** in the editor to pull current prices.

## CSV format

```csv
type,code,brand,description,unit,price
Brake pads,BP-1023,Brembo,"Front brake pad set, VW Golf VII",set,48.90
```

Header names are matched case-insensitively (also `category`, `sku`, `part number`, `name`, `make`, ...).

## Project layout

```
index.html            app shell
css/styles.css        app UI, A4 page templates, print styles
js/config.js          Firebase web config (placeholder = demo mode)
js/store.js           Firestore / localStorage data layer
js/state.js           live in-memory state and default settings
js/model.js           offer shape, totals, numbering
js/page.js            renders a document as an A4 page
js/views/*.js         offers gallery, items database, editor, settings
firestore.rules       security rules (allow list)
```
