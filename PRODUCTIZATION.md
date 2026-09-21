# List2Sheet Productization Plan

This document starts the release-quality phase after the extraction MVP proved the core flows.

## Release target

Target: a public beta that a new user can install and understand without developer guidance.

A build is release-ready only when these flows are reliable:

1. Install extension.
2. Scan a normal page.
3. Choose the intended dataset or use Pick from page.
4. Customize fields if needed.
5. Collect more rows when needed.
6. Export useful data.
7. Understand Free vs Pro without confusion.
8. Activate or recover Pro.
9. Recover from common errors without developer help.

## UI principles

- Keep the default popup focused on the most common path.
- Hide advanced collection and cleanup controls until requested.
- Prefer one clear primary action per section.
- Preserve user state across popup reopen.
- Do not make users reconfigure fields after collection.
- Status text should explain what happened and what to do next.
- Avoid exposing implementation language such as DOM, iframe, selector, webhook, or session state to normal users.

## Free / Pro boundary

### Free

- Scan current page.
- Manual Pick.
- Preview detected data.
- Edit fields.
- Basic cleanup.
- Highlight source.
- Copy up to 100 rows as TSV.
- Saved settings / recipes.

### Pro

- Unlimited rows.
- CSV / JSON / Markdown / XLSX file export.
- Infinite-scroll collection.
- Multi-page collection.

Decision for public beta: Saved Settings remains Free. It improves repeat usage and lets users experience List2Sheet's workflow value before upgrading; Pro is reserved for scale and file export automation.

## QA matrix

Test every release against at least these page types:

- Plain HTML table.
- Large table with 10+ columns.
- Ajax-paginated table.
- Search results page.
- Product-card grid.
- Infinite-scroll product/list page.
- Same-origin iframe table.
- Manual Pick on a table.
- Manual Pick on repeated cards.
- Page with no useful structured data.

For each page type verify:

- Correct first dataset.
- Dataset switching.
- Field names.
- Highlight / Clear highlight.
- Field rename/select/order.
- Cleanup.
- Session restore.
- Saved settings restore.
- Copy TSV.
- XLSX.
- CSV.
- Infinite scroll where applicable.
- Pagination where applicable.

## Error handling before public beta

Replace technical errors with user-facing actions where practical.

Examples:

- Stale frame -> retry automatically; only show an error after retry fails.
- No dataset -> suggest Pick from page.
- No Next control -> explain that this page may use unsupported pagination and keep existing rows.
- Page changed since scan -> offer Scan again.
- License verification offline -> use valid cache when allowed and explain retry.

## Chrome Web Store preparation

Prepare before submission:

- Production extension name and description.
- App icon set and final logo.
- Store screenshots based on real supported workflows.
- Short and long product description.
- Privacy policy hosted on rainnightlabs.com.
- Terms / refund links on the product site.
- Permission justification for activeTab, scripting, storage, and tabs.
- Explanation of the rainnightlabs.com host permission for license verification.
- No remotely hosted executable code.
- Versioned release notes.
- Clean ZIP/package built from a tagged Git commit.

## Privacy review

List2Sheet should keep the privacy story simple:

- Page data is processed locally unless a feature explicitly says otherwise.
- Exported data stays on the user's device.
- License verification sends only the information required for license status.
- Do not add analytics before deciding exactly what events are necessary and documenting them.
- Do not collect scraped page content for telemetry.

Verify that public Privacy Policy text matches actual extension behavior before submission.

## Release engineering

Before public beta:

- Add automated unit tests for pure extraction/cleanup functions.
- Add fixture pages for table, cards, search results and pagination.
- Create a manual release checklist.
- Tag releases in GitHub.
- Keep Sandbox and Live Paddle credentials separated.
- Produce a fresh packaged build from the release tag.

## Next productization milestones

### v0.8
- Compact popup UI.
- Persistent highlight.
- Start user-facing error cleanup.

### v0.9 — implemented
- First-run onboarding.
- Empty-state guidance.
- Friendly error messages.
- Browser extraction fixtures/tests.
- Final Free/Pro gating review.

### v0.13.1 — licensing hardening
- Normal activation requires only the signed license code.
- Purchase email is kept for recovery/issuance, not routine activation.
- Online entitlement is rechecked against Paddle every 24 hours.
- Approved full refunds and chargebacks revoke Pro access.
- A bounded 7-day offline grace protects paid users during temporary service outages.

### v1.0 candidate
- Chrome Web Store assets.
- Permission/privacy review.
- Paddle Live readiness.
- Production license/refund behavior.
- Release checklist passed on the QA matrix.


## v0.13 release-candidate freeze

The first public release candidate freezes new site adapters. Until the initial Chrome Web Store submission is complete, changes should be limited to:

- regressions and correctness bugs
- release packaging
- privacy/permission alignment
- store assets and listing copy
- production licensing/payment readiness
- severe usability issues

New site adapters and semantic/AI filtering move to post-launch releases.
