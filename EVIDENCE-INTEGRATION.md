# Alura + Etsy evidence integration

Schema references: [Etsy Open API reference](https://developer.etsy.com/documentation/reference), [Alura keyword research](https://docs.alura.io/guides/keyword-research), [Alura product search](https://docs.alura.io/api-reference/research/products/search), and [Alura product reviews](https://docs.alura.io/api-reference/research/products/reviews). Documented fields are explicitly distinguished below from live-verified fields.

The primary page now begins with Etsy-only exploration. It accepts a keyword, product idea, direct Etsy listing URL, or direct Etsy shop URL. It shows observed directions and products, then opens the combined report for a selected keyword. An explicit Alura lookup costs up to two included Free-plan credits. A matching exact or related Alura measurement already returned in the browser session is reused. The page does not estimate demand from listing frequency.

## Keyword-to-listing index

`dist/js/research-index.js` stores up to 12 browser-local Etsy observations for six hours and reuses a matching observation for 15 minutes. Each has the search term or source context, timestamp, returned listing IDs, per-listing relevance and observed characteristics, related phrases, and source. The index connects earlier searches only through shared returned listing IDs. It explicitly does not claim that a listing consistently ranks for a term. Listing and shop URL discovery uses titles and tags; keyword discovery retains exact-token matching and documented synonym hypotheses. A separate `digital` query runs only when a broad keyword sample has no downloads, and the two samples remain distinct. Expired saved briefs retain a compact concept label but refresh Etsy evidence before reopening.

## Field audit

| Signal | Source and status | Meaning and limit |
| --- | --- | --- |
| Estimated monthly keyword searches | Alura API, observed in an earlier live `wedding planner` response; other markets not checked this milestone | Provider estimate, not Etsy's measured search count or orders. Current endpoint describes a 12-month average, not a month-by-month series. |
| Related keywords and competing listing estimates | Alura API, observed in the earlier live response | Related terms are provider observations. Its competition definition is separate from Etsy's broad match count. |
| Etsy total listing count | Etsy Open API v3, live response confirmed for three markets | Broad keyword matches, not a count of relevant digital competitors. |
| Listing title, tags, listing type, price, favorites, creation timestamp | Etsy Open API v3, live proxy response confirmed | Sampled active listings. Favorites are engagement. Creation time does not establish recent sales. |
| Currency, description, shop ID | Documented Etsy listing fields; newly passed through by the proxy when present | Not yet verified in a live response through this new code. Prices without a currency are omitted from the combined price range. |
| Listing attributes | Documented in Etsy listing schema, not currently used in the report | Availability and usefulness for this sample remain unverified. |
| Shop-wide transaction count | Documented Etsy shop field, not queried | Cumulative shop-wide activity, not listing-level sales. |
| Listing-level sales | Not available in the current public Etsy listing response | Unknown. No sales estimate is inferred from age or favorites. |
| Dated listing reviews | Etsy API endpoint documented and integrated as an optional check for up to three relevant digital listings; not yet live-verified here. Optional Alura buyer check also exists. | A review is purchase-linked but not a purchase date or a count of all sales. The Alura buyer path has not passed a live check after its last API-field fix. |
| Historical search trends, conversion, purchase totals | Not returned by the current Alura keyword endpoint | Unknown in this workflow. Do not label the current average as sustained demand. |

Live Etsy spot checks before implementation: `digital poster` returned 3,068,440 broad matches and 97 downloadable listings in the first 100; `ADHD planner` returned 90,926 and 98/100; `wedding budget spreadsheet` returned 11,355 and 100/100. These are search-result samples, **not** verified counts of relevant competitors. The integrated report filters each sample by exact token or a documented synonym before showing a relevant digital count. No additional Alura calls were made for these markets because the owner set a zero-credit limit.

Additional live Etsy keyword checks on the existing production endpoint: `gardening` returned 1,612,593 broad matches with 2 downloadable listings among 100 returned; `mushroom logbook` returned 47 matches with 21 downloadable listings among 47 returned. The new listing/shop adapter and exploration UI were tested locally with explicitly labelled fixtures and have **not** been exercised against live Etsy responses. No Alura calls were made for this milestone.

## Research conclusion rules

The report presents Alura search interest only when an exact matching keyword measurement exists. It filters Etsy's returned sample to relevant downloadable listings, keeps currencies separate, and links the listings underlying each proposed concept. A phrase appearing in titles or tags indicates seller wording, not buyer demand. A possible difference is a hypothesis based on sampled text; the buyer and product functionality still need checking. Purchase activity remains unverified until dated purchase-linked evidence is actually returned. The optional Etsy review check uses no Alura credits and preserves unknown on provider failure. There is no opportunity score or automatic go/no-go decision.

## Current limits

The first 100 relevance-ranked Etsy results can miss specialized competitors; the listing/shop adapter currently samples up to 50 active shop listings. The Etsy `market` argument is a research label, not a geo-localized search; Alura does not report geography in this response. Current product concepts are deterministic and based on sampled listing text, so their feature and audience claims are only starting points. Production is unchanged until this branch is reviewed and deployed. The listing/shop adapter and three-market live combined Alura+Etsy workflow remain unverified; the latter is blocked by the owner's explicit instruction to use zero additional Alura credits. Etsy's [current API Terms](https://www.etsy.com/legal/api/) limit listing-content display age to six hours and restrict API-content analytics without written authorization; authorization for this specific research use has not been confirmed.
