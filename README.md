# List2Sheet

**List2Sheet** is a browser extension by **Rainnight Labs** for turning web tables, lists, and repeated cards into structured data.

Repository status: **v0.6 multi-page collection build**

## Phase 1 features

- Chrome Manifest V3
- Scan the current page on demand
- Detect:
  - HTML tables
  - repeated sibling/card structures
- Dataset chooser
- Semantic product fields (Title / Price / Seller / Sales / Rating / URL / Image)
- Field editor:
  - include / exclude columns
  - rename export columns
  - reorder columns
  - reset configuration
- Highlight the detected source region on the active webpage
- In-popup data preview:
  - explicit "Showing X of Y rows"
  - 12 / 50 / All preview modes
  - preview limit does not affect export
- Pro multi-page collection:
  - background service worker keeps the task alive while the popup closes during navigation
  - detects same-site Next-page links
  - collect 2 / 5 / 10 next pages
  - reuses the same extraction engine on every page
  - de-duplicates and merges into the current session dataset
  - shows task progress when the popup is reopened
  - user can stop a running task
- Pro auto-scroll collection:
  - reuses the same extraction engine as the normal Scan button on every round
  - re-selects the matching dataset after lazy loading
  - preserves saved field configuration and cleanup rules
  - collect newly loaded rows while scrolling
  - de-duplicate collected rows
  - stop early after two no-growth rounds
  - return to the original scroll position
  - keep field and cleanup configuration
- Saved settings / recipe:
  - save field selection
  - save renamed columns
  - save column order
  - save cleanup options
  - automatically reapply after scanning the same compatible dataset on the same site
  - forget a saved configuration
- Data cleanup:
  - remove duplicate rows
  - remove empty rows
  - optionally require Title
  - normalize price formatting
  - optionally remove common tracking parameters from URLs
- Free plan:
  - up to 100 rows
  - Copy TSV
- Pro framework:
  - unlimited rows
  - CSV export
  - JSON export
  - Markdown export
  - XLSX export (self-contained, no remote library)
- Rainnight Labs license activation
- License verification against:
  - `https://www.rainnightlabs.com/api/license-verify/`
- 7-day local verification cache for previously verified licenses

## Load locally in Chrome

1. Clone or download this repository.
2. Open Chrome.
3. Go to:
   `chrome://extensions`
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select this repository folder.
7. Pin **List2Sheet** to the toolbar.

## Test the free flow

Open a normal webpage containing an HTML table or a repeated product/result list.

Click List2Sheet → **Scan current page**.

The free build allows preview and TSV copy for up to 100 rows.

## Test Pro activation

1. Complete a Paddle Sandbox purchase on:
   `https://www.rainnightlabs.com/pricing/`
2. Copy the generated `L2S1...` license.
3. In the extension, click **Activate Pro**.
4. Enter:
   - the purchase email
   - the `L2S1...` license
5. Click **Verify and activate**.
6. Re-open the popup.

The badge should show **PRO**, and CSV / JSON / Markdown exports should be unlocked.

## Permissions

The MVP intentionally keeps permissions narrow:

- `activeTab` — access the page only after the user invokes List2Sheet
- `scripting` — run the extraction function in the active tab
- `storage` — store local license activation state
- host permission only for `https://www.rainnightlabs.com/*` — verify a Rainnight Labs license

No broad `<all_urls>` permission is used.

## Not yet implemented

These are planned Pro features and are **not** part of the MVP yet:

- Edge / Firefox packaging
- automated tests

## Brand

Rainnight Labs  
https://www.rainnightlabs.com  
admin@rainnightlabs.com


## v0.5.1 reliability fix

- Saved settings now use compatibility matching instead of requiring an exact header signature.
- When a saved recipe matches multiple detected datasets, List2Sheet automatically selects the strongest match.
- Infinite-scroll collection no longer uses a separate simplified extractor; every scroll round re-runs the main extraction engine, preventing Title/Price inconsistencies.


## v0.5.2 session reliability

- Current tab scan results are cached in `chrome.storage.session`.
- Closing and reopening the extension popup on the same page restores collected rows, headers, field configuration, cleanup state, and selected dataset.
- Session state is page-specific and intentionally expires with the browser session; long-term reusable rules still live in Saved Settings.
- Column configuration is sanitized during restore so renamed headers cannot disappear because of incomplete popup state.


## v0.6 pagination architecture

Traditional pagination closes the extension popup when the tab navigates, so pagination is handled by a Manifest V3 background service worker rather than the popup itself.

The first pagination release intentionally follows only normal same-origin Next links. JavaScript-only pagination buttons and anti-bot protected sites will be handled separately after this path is proven stable.
