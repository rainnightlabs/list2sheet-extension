# List2Sheet Browser Fixture Tests

These fixtures run the production `shared/extractor.js` against deterministic local HTML pages.

## Run

1. Load List2Sheet unpacked in Chrome.
2. Copy the extension ID from `chrome://extensions`.
3. Open `chrome-extension://<EXTENSION_ID>/tests/runner.html`.
4. Confirm all fixtures pass.

Current fixtures:

- HTML table
- repeated product cards
- semantic search results
- real table plus pagination-noise table
- empty/no-data page

These tests are local and deterministic. They complement, rather than replace, the manual QA matrix against real websites.