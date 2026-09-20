# List2Sheet Permissions & Privacy Review

This file describes the intended behavior of the extension and is the internal source of truth for store-review answers. Keep it aligned with the manifest and public Privacy Policy.

## Product privacy model

List2Sheet is designed around local extraction:

- The user explicitly opens the extension and starts Scan or Pick.
- Page content is read in the active tab to create local structured datasets.
- Normal preview, cleanup, keyword filtering, copying, and file export happen in the browser.
- Scraped page content should not be uploaded to Rainnight Labs for analytics.
- License verification is separate from webpage extraction.

## Manifest permissions

### activeTab

Purpose: temporarily access the current page after the user invokes List2Sheet.

Why it is needed: Scan, Pick, Highlight, infinite-scroll collection, and page-level extraction operate on the page chosen by the user.

### scripting

Purpose: execute the extraction/highlight/picker logic in the user-selected page and accessible frames.

Why it is needed: List2Sheet must inspect the rendered page structure after explicit user interaction.

### storage

Purpose: store local UI language, Saved Settings/recipes, current session state where applicable, and license activation/cache state.

Why it is needed: users should not need to reconfigure the same dataset every time they reopen the popup.

### tabs

Purpose: coordinate multi-page collection and read/update the active tab while a pagination task runs.

Why it is needed: traditional pagination can navigate the tab and close the popup, so the background service worker must track the task.

## Host permission

### https://www.rainnightlabs.com/*

Purpose: contact Rainnight Labs license verification endpoints and open product/privacy pages.

No broad <all_urls> host permission is currently requested.

## Page-content handling

Normal extraction should not send page data to Rainnight Labs.

Site adapters can make requests to the website the user is currently viewing when necessary to obtain content the page itself exposes. Example: the Bilibili adapter may request Bilibili video/comment/danmaku endpoints from the Bilibili page context. This is distinct from sending scraped content to Rainnight Labs.

## Analytics

Current release intent:

- no scraped-content telemetry
- no advertising profiling
- no sale of user data
- no background collection of browsing history

If analytics are added later, define exact events first and update both this document and the public Privacy Policy before release.
