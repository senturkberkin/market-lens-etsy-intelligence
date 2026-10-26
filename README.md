# Market Lens

Etsy digital product research dashboard with an official Etsy Open API provider boundary. Live Etsy listing counts and observed prices are retrieved server-side; unsupported demand metrics remain unavailable rather than being estimated from unrelated signals.

## MVP architecture

- **Data model:** product hypotheses, market observations (source/timestamp/method/confidence), operating assumptions, and normalized score weights.
- **Calculation engine:** `dist/js/calculations.js` contains pure revenue, profit, percentile, scoring, and sensitivity functions, covered by `test/calculations.test.js`.
- **UI:** a static, responsive dashboard in `dist/`, with browser-local persistence and JSON/CSV export.
- **Live ingestion:** `api/etsy-keyword.js` proxies Etsy Open API v3 from a serverless runtime. Set `ETSY_API_KEY` there and point `dist/config.js` at that deployment. Never put the key in the static client or GitHub repository.

## Data limits

Etsy Open API supplies live active-listing results and observed listing prices, but not Etsy marketplace keyword search volume. Market Pull and GO/NO-GO therefore remain unavailable until a permitted demand-data provider is connected. Review counts are never treated as sales.
