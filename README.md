# List2Sheet

**List2Sheet** is a browser extension by **Rainnight Labs** for turning web tables, lists, and repeated cards into structured data.

Repository status: **v0.11.0 robust discussion extraction + bilingual UI build**

## Phase 1 features

- Chrome Manifest V3
- Scan the current page on demand
- Detect:
  - semantic search-result lists
  - real HTML data tables
  - ARIA / div-based data grids
  - repeated sibling/card structures
  - same-origin iframe datasets
  - comment / discussion streams with Author / Comment / Date / Likes / Replies / URL when available
- Dataset chooser
- Semantic product fields (Title / Price / Seller / Sales / Rating / URL / Image)
- Field editor:
  - include / exclude columns
  - rename export columns
  - reorder columns
  - reset configuration
- Highlight the detected source region on the active webpage
- Manual Pick fallback:
  - click one real table row or repeated card on the webpage
  - infer the surrounding table/repeated group
  - create a dataset even when automatic ranking is not useful
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
  - remove obvious ads / sponsored rows
  - keep or exclude rows by comma/newline-separated keywords across all exported fields
- Free plan:
  - scan current page
  - Manual Pick
  - preview / field editing / cleanup / highlight
  - saved settings
  - up to 100 rows
  - Copy TSV
- Pro framework:
  - unlimited rows
  - infinite scroll and multi-page collection
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


## v0.6.1 extraction accuracy

This release pauses pagination feature expansion and improves the scanner first:

- Google-style pager/layout tables with only page numbers are rejected.
- Search-result pages receive a dedicated Title / URL / Domain / Snippet dataset.
- HTML data tables use header quality, row count, and layout heuristics instead of receiving a blanket top score.
- ARIA role=table / role=grid structures are recognized as data grids.
- Navigation/sidebar and pagination lists are filtered more aggressively.
- Normal scans inspect accessible same-origin frames and preserve the frame id for highlight and collection.


## v0.6.2 dynamic pagination

Pagination no longer requires a normal href-only Next link.

Supported discovery now includes:

- rel=next / Next / 下一页 links
- right-arrow controls such as >, ›, » and →
- the numeric page immediately after the active/current page
- page 2 as a first-page fallback when no active marker is exposed
- JavaScript/Ajax page buttons without navigable hrefs
- pagination controls inside the same frame as the selected dataset

For Ajax pagination, List2Sheet clicks the control and waits until the selected dataset changes before extracting and continuing.


## v0.6.3 stable pagination

- Ajax pagination no longer collects immediately after the first DOM change.
- Each page is scanned repeatedly until row count and content are stable across multiple checks.
- The first scanned page becomes a soft expected page-size hint; a temporarily short render gets extra wait time.
- Per-page row counts are recorded in pagination status (for example: 10 / 10 / 10 / 10 / 10).
- The popup now re-reads background session state while pagination runs, so preview rows and headers update without requiring a manual re-scan.


## v0.7 manual picker and frame recovery

- Stale iframe ids during Ajax pagination are automatically rediscovered instead of immediately failing with "No frame with id ...".
- Pagination controls are rediscovered across live frames and clicked with a fresh frame id.
- "Pick data from page" provides a manual fallback when automatic detection is imperfect.
- The picker stores the selected dataset in the same tab session, so reopening the popup immediately shows the picked data.
- Press Escape while picking to cancel.


## v0.7.1 manual picker integration

- Picked HTML tables now retain a real table selector.
- Picked repeated cards retain parent selector, item tag, item classes, and child indexes.
- Picked datasets therefore use the same source format as automatically detected datasets, enabling highlight and improving compatibility with auto-scroll, pagination matching, and saved field settings.
- Repeated manual picks replace the previous manual-picked dataset in the same tab instead of accumulating stale manual datasets.


## v0.8.0 productization UI

- Source highlighting is now persistent instead of disappearing after 2.6 seconds.
- Highlight is a real toggle: Highlight source / Clear highlight.
- Existing highlights are restored cleanly before another dataset is highlighted.
- Popup information architecture is simplified:
  - Scan / Pick are the only primary start actions.
  - Dataset / Highlight / Save remain immediately available.
  - Field editing and cleanup live under Customize data.
  - Infinite scroll and pagination live under a collapsed Collect more (PRO) group.
  - Preview remains visible.
  - Copy TSV and XLSX are the primary export actions.
  - CSV / JSON / Markdown move under More formats.
- The goal of v0.8 is release-quality usability rather than adding more extraction features.


## v0.9.0 onboarding and QA

- First-run onboarding explains the basic Scan/Pick → Review → Export workflow.
- Successful first use automatically dismisses onboarding.
- Empty scan results now show an actionable Manual Pick fallback instead of a dead-end message.
- Common Chrome/runtime/frame errors are translated into user-facing recovery guidance.
- Free/Pro boundary is finalized for the public beta:
  - Free includes Scan, Manual Pick, Preview, fields, cleanup, highlight, Saved Settings, and Copy TSV up to 100 rows.
  - Pro adds unlimited rows, file exports, infinite-scroll collection, and multi-page collection.
- Browser fixture tests are included under `tests/` for deterministic extraction checks.


## v0.10.0 comments, keyword filtering and ad cleanup

- Dedicated comment/discussion-stream detection for video and content pages.
- Comment datasets prioritize Author / Comment / Date / Likes / Replies / URL fields when those elements are present.
- Obvious sponsored/ad rows receive an internal marker and are removed by default without exporting the marker.
- Keyword filtering supports:
  - Keep rows matching any keyword.
  - Exclude rows matching any keyword.
  - Comma or newline separated terms.
  - Matching across all exported fields.
- Keyword/ad cleanup is preserved by Saved Settings and is applied during pagination collection.
- First-run onboarding is visually stronger with a START HERE treatment.
- Dynamic or virtualized comment systems may still require site-specific tuning or Manual Pick.


## v0.10.1 stacked keyword filters and danmaku separation

- Keyword filtering now supports ANY (OR) and ALL (AND) matching.
- "Refine current filtered results" stacks a new filter stage on top of earlier stages.
- Active filter-stage count is visible and all keyword stages can be cleared without resetting other cleanup rules.
- Saved Settings preserves the stacked keyword filter chain.
- Bilibili-style danmaku/bullet-comment streams are no longer labeled as normal Comments; they appear as a separate Danmaku dataset with a lower default ranking.
- True semantic-similarity filtering is intentionally not claimed in this release. Current filters remain deterministic local text matching.


## v0.11.0 robust comments/danmaku and bilingual UI

- Discussion extraction now searches nested repeated-item containers instead of requiring comment items to be direct children of the first matching section.
- Open Shadow DOM roots are inspected for discussion components.
- Comments and danmaku are discovered broadly first, then classified using social metadata and container context.
- Comment/reply selectors now include reply-item, root-reply, sub-reply and message/content patterns commonly used by video sites.
- UI language can be switched between English and Simplified Chinese from the popup header.
- The selected language is stored locally and is shared with the Pro activation page.
- Structured export field names remain stable in English (for example Author / Comment / Date) so saved settings and downstream files do not change schema when the UI language changes.
