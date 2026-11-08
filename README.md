# Market Lens

Etsy digital product research dashboard with an official Etsy Open API provider boundary. Live Etsy listing counts and observed prices are retrieved server-side; unsupported demand metrics remain unavailable rather than being estimated from unrelated signals.

## MVP architecture

- **Data model:** product hypotheses, market observations (source/timestamp/method/confidence), operating assumptions, and normalized score weights.
- **Calculation engine:** `dist/js/calculations.js` contains pure revenue, profit, percentile, scoring, and sensitivity functions, covered by `test/calculations.test.js`.
- **UI:** a static, responsive dashboard in `dist/`, with browser-local persistence and JSON/CSV export.
- **Live ingestion:** `api/etsy-keyword.js` proxies Etsy Open API v3 from a serverless runtime. Set `ETSY_API_KEY` there and point `dist/config.js` at that deployment. Never put the key in the static client or GitHub repository.

## Data limits

Etsy Open API supplies active-listing results and observed listing prices, but not Etsy marketplace keyword search volume. The keyword report accepts dated, sourced demand observations and a documented product-gap assessment. The evidence-based engine returns EXPLORE, VALIDATE or AVOID under the rules in [ALGORITHM.md](./ALGORITHM.md); it never estimates sales from favorites or listings. Financial calculators use user assumptions and demo fixtures.

Keyword discovery starts with one unrestricted seed. It extracts phrases from relevant physical and digital listing titles and tags, labels observed phrases separately from synonym-based hypotheses, groups them by buyer need, audience, and format intent, and lets the user investigate each candidate through the Etsy report. The report shows sampled listing types and links. When a broad query returns no digital listings, a separate, labelled digital search probe may add more directions; its results are not combined with the original query. Discovery frequency is only a count within the returned relevance-ranked sample; it does not measure demand. The existing EXPLORE/VALIDATE/AVOID engine assesses digital product hypotheses only, and its output does not decide physical product viability. See [ALGORITHM.md](./ALGORITHM.md) for evidence limits.

Investigating a keyword now proposes up to five digital-product hypotheses from at least two relevant sampled listings. Each proposal includes audience, problem, format, core function, a tentative difference, the observed comparison, and links to sampled listings. Selecting one pre-fills the existing assessment form but never verifies its gap. If no relevant evidence exists, the report says that no evidence-linked concept is available. The application is static HTML/JS under `dist/`; there is no separate build step.
