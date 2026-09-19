# List2Sheet

**List2Sheet** is a browser extension by **Rainnight Labs** for turning web tables, lists, and repeated cards into structured data.

Repository status: **v0.4.1 saved settings build**

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
- In-popup data preview
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

- infinite-scroll automation
- multi-page crawling
- Edge / Firefox packaging
- automated tests

## Brand

Rainnight Labs  
https://www.rainnightlabs.com  
admin@rainnightlabs.com
