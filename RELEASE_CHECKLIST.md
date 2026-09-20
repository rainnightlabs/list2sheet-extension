# List2Sheet Release Checklist

Use this checklist for every public Chrome release.

## 1. Freeze

- [ ] Manifest version is correct.
- [ ] No experimental site adapter or unfinished feature is being added during release QA.
- [ ] No API keys, Paddle secrets, webhook secrets, or license signing secrets exist in the extension repository.
- [ ] Sandbox-only credentials are not referenced by the production extension.

## 2. Core regression

Verify on real pages:

- [ ] Plain HTML table.
- [ ] Ajax/paginated table.
- [ ] Infinite-scroll list.
- [ ] Product/card list.
- [ ] Search results.
- [ ] Comments.
- [ ] X post feed.
- [ ] Manual Pick.
- [ ] Page with no useful structured data.

For applicable pages:

- [ ] Correct dataset is selected by default.
- [ ] Dataset switching works.
- [ ] Highlight / Clear highlight works.
- [ ] Field include/exclude works.
- [ ] Field rename works.
- [ ] Field reorder works.
- [ ] Duplicate removal works.
- [ ] Ad/sponsored cleanup works.
- [ ] Keyword ANY works.
- [ ] Keyword ALL works.
- [ ] Refine current results works.
- [ ] Restore rows works.
- [ ] Saved Settings restore correctly.
- [ ] Popup reopen restores the current session.
- [ ] Auto-scroll collection works.
- [ ] Pagination collection works.
- [ ] English / Simplified Chinese switching works.

## 3. Export

- [ ] Copy TSV respects the Free 100-row limit.
- [ ] CSV exports correctly in Pro.
- [ ] JSON exports correctly in Pro.
- [ ] Markdown exports correctly in Pro.
- [ ] XLSX opens correctly in Excel.
- [ ] Export filenames contain host, dataset type, and timestamp.
- [ ] Internal fields such as __l2sAd never appear in exports.

## 4. License

- [ ] Free state is correct on a fresh browser profile.
- [ ] Valid Pro license activates.
- [ ] Invalid license is rejected cleanly.
- [ ] Pro remains active after popup/browser restart according to cache rules.
- [ ] Deactivate removes the local activation.
- [ ] Production build points only to the intended Rainnight Labs production license endpoint.

## 5. Privacy and permissions

- [ ] Manifest permissions match PERMISSIONS_PRIVACY.md.
- [ ] No broad <all_urls> host permission was added unintentionally.
- [ ] Page content is not sent to Rainnight Labs by the normal extraction/export flow.
- [ ] No scraped page content is used for analytics/telemetry.
- [ ] Public Privacy Policy matches actual behavior.
- [ ] Site-specific adapters are documented if they make requests to the current website.

## 6. Package

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1
```

Then:

- [ ] Open the generated ZIP and verify manifest.json is at the ZIP root.
- [ ] tests/, test-pages/, docs, git metadata and local files are absent.
- [ ] icons/ is present once final production icons are added.
- [ ] Load the staged release folder as an unpacked extension and run a final smoke test.

## 7. Store listing

- [ ] Production icon set.
- [ ] Store screenshots.
- [ ] English short description.
- [ ] English long description.
- [ ] Simplified Chinese listing copy if publishing localized listing text.
- [ ] Privacy policy URL.
- [ ] Support/contact URL or email.
- [ ] Permission justifications are consistent with the submitted manifest.

## 8. Release record

- [ ] Final commit SHA recorded.
- [ ] Git tag created for the submitted version.
- [ ] Submitted ZIP hash recorded if desired.
- [ ] Release notes written.
