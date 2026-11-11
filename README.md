# Market Lens

## Exploration-first workflow (integration branch)

The primary page accepts a keyword, product idea, Etsy listing URL, or Etsy shop URL. **Explore** retrieves Etsy listing evidence only, extracts observed keyword directions from titles and tags, and shows related digital products. A broad search with no downloadable listings can make a separately labelled `digital` follow-up query; its listing count is never combined with the original search. Selecting a direction opens the existing combined competitor report and product hypotheses. An explicit button can add an Alura demand estimate for that selected keyword using up to two included Free-plan credits. Exploration, listing/shop lookup, and cached-direction navigation use no Alura credits.

`dist/js/research-index.js` keeps a browser-local index of at most 12 recent Etsy observations for six hours and reuses an observation for 15 minutes. Each record includes the query or source URL context, timestamp, returned listing IDs, per-listing relevance and characteristics, observed phrases, and source. Shared listing IDs can connect earlier searches; appearance in a sample does **not** establish consistent ranking or buyer demand. No server-side history is introduced. Saved briefs retain their concept name after six hours but must refresh expired Etsy listing evidence before reopening.

`api/etsy-source.js` uses Etsy's documented listing, shop-name search, and active shop-listing endpoints. It is limited to direct Etsy listing/shop inputs and protected by the existing Vercel access gate. This new endpoint has fixture tests but has not yet been live-tested because the branch is not deployed. The existing live Etsy keyword endpoint was verified separately. The Alura integration, detailed evidence report, optional Etsy dated-review check, saved briefs, and legacy research page remain available. Production and `main` remain unchanged.

See [EVIDENCE-INTEGRATION.md](./EVIDENCE-INTEGRATION.md) for field definitions, live verification, and limits. Run `npm test` before any deployment.

Etsy's [API Terms](https://www.etsy.com/legal/api/) limit how long listing content may be displayed and separately restrict analytics of Etsy API content without written authorization. The six-hour display limit is enforced locally; the analytics authorization question remains unresolved, so this branch has not been deployed.

## MVP architecture

- **Data model:** product hypotheses, market observations (source/timestamp/method/confidence), operating assumptions, and normalized score weights.
- **Calculation engine:** `dist/js/calculations.js` contains pure revenue, profit, percentile, scoring, and sensitivity functions, covered by `test/calculations.test.js`.
- **UI:** a static, responsive dashboard in `dist/`, with browser-local persistence and JSON/CSV export.
- **Live ingestion:** `api/etsy-keyword.js` proxies Etsy Open API v3 from a serverless runtime. Set `ETSY_API_KEY` there and point `dist/config.js` at that deployment. Never put the key in the static client or GitHub repository.

## Data limits

Etsy Open API supplies active-listing results and observed listing prices, but not Etsy marketplace keyword search volume. The keyword report accepts dated, sourced demand observations and a documented product-gap assessment. The evidence-based engine returns EXPLORE, VALIDATE or AVOID under the rules in [ALGORITHM.md](./ALGORITHM.md); it never estimates sales from favorites or listings. Financial calculators use user assumptions and demo fixtures.

Keyword discovery starts with one unrestricted seed. It extracts phrases from relevant physical and digital listing titles and tags, labels observed phrases separately from synonym-based hypotheses, groups them by buyer need, audience, and format intent, and lets the user investigate each candidate through the Etsy report. The report shows sampled listing types and links. When a broad query returns no digital listings, a separate, labelled digital search probe may add more directions; its results are not combined with the original query. Discovery frequency is only a count within the returned relevance-ranked sample; it does not measure demand. The existing EXPLORE/VALIDATE/AVOID engine assesses digital product hypotheses only, and its output does not decide physical product viability. See [ALGORITHM.md](./ALGORITHM.md) for evidence limits.

Investigating a keyword now proposes up to five digital-product hypotheses from at least two relevant sampled listings. Each proposal includes audience, problem, format, core function, a tentative difference, the observed comparison, and links to sampled listings. Selecting one pre-fills the existing assessment form but never verifies its gap. If no relevant evidence exists, the report says that no evidence-linked concept is available. The application is static HTML/JS under `dist/`; there is no separate build step.
