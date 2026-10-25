# Market Lens

Private, local-first Etsy digital product research dashboard. It ships with explicitly labelled synthetic fixtures and user-editable assumptions; it makes no claim to live Etsy data.

## MVP architecture

- **Data model:** product hypotheses, market observations (source/timestamp/method/confidence), operating assumptions, and normalized score weights.
- **Calculation engine:** `dist/js/calculations.js` contains pure revenue, profit, percentile, scoring, and sensitivity functions, covered by `test/calculations.test.js`.
- **UI:** a static, responsive dashboard in `dist/`, with browser-local persistence and JSON/CSV export.
- **Future ingestion:** adapters should only write normalized observations after authorized Etsy/provider/API retrieval; credentials belong in a backend, never this static client.

## Data limits

Etsy public surfaces and licensed keyword providers may not supply demand, sales, or traffic. Unsupported metrics remain user-supplied or `N/A`; review counts are never treated as sales. Fixture values are deterministic examples only.
