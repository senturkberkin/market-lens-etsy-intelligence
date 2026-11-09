# Alura + Etsy evidence integration

Schema references: [Etsy Open API reference](https://developer.etsy.com/documentation/reference), [Alura keyword research](https://docs.alura.io/guides/keyword-research), [Alura product search](https://docs.alura.io/api-reference/research/products/search), and [Alura product reviews](https://docs.alura.io/api-reference/research/products/reviews). Documented fields are explicitly distinguished below from live-verified fields.

The primary page now produces a combined report. An Alura lookup is optional and costs up to two included Free-plan credits. The Etsy-only path costs zero Alura credits. Selecting an observed direction reuses any exact or related Alura measurement already returned in the current browser session and queries Etsy for the narrower phrase. The page does not estimate demand from listing frequency.

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

## Research conclusion rules

The report presents Alura search interest only when an exact matching keyword measurement exists. It filters Etsy's returned sample to relevant downloadable listings, keeps currencies separate, and links the listings underlying each proposed concept. A phrase appearing in titles or tags indicates seller wording, not buyer demand. A possible difference is a hypothesis based on sampled text; the buyer and product functionality still need checking. Purchase activity remains unverified until dated purchase-linked evidence is actually returned. The optional Etsy review check uses no Alura credits and preserves unknown on provider failure. There is no opportunity score or automatic go/no-go decision.

## Current limits

The first 100 relevance-ranked Etsy results can miss specialized competitors. The Etsy `market` argument is currently a research label, not a geo-localized search; Alura does not report geography in this response. Current product concepts are deterministic and based on sampled listing text, so their feature and audience claims are only starting points. Production is unchanged until the integration has been reviewed and deployed. A three-market **live combined** demonstration is still blocked by the owner's explicit instruction to use zero additional Alura credits.
