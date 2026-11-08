# Keyword opportunity engine (OE-1.1)

## Audit of the former decision

The old keyword formula mixed assumed search demand, price and listing count into weighted 0–100 scores, then used fixed GO/WATCH/NO-GO thresholds. Etsy does not provide keyword search volume through this endpoint. Legacy product detail data remains in browser storage, but the synthetic GO/NO-GO and comparison screens are disabled. The accessible Revenue and Sensitivity panels use editable assumptions and demo fixtures, not observed market evidence.

## Available evidence

| Signal | Meaning | Limitation |
| --- | --- | --- |
| `count` | Etsy active listings matching the broad query | Supply, not buyer searches; includes physical listings |
| `listing_type` | Digital or physical type for each returned listing | Only the relevance-ranked sample (up to 100) |
| title and tags | Words used for deterministic exact-token relevance | Misses synonyms, variants and semantic equivalents |
| price | Listed asking price | Different currencies may be mixed; no exchange conversion is performed |
| creation timestamp and favorites | Public listing age and cumulative saves | Neither is sales; both suffer exposure and survival bias; currently collected but unused |
| sampled position | Position within Etsy API's relevance-ranked results | Ranking changes and does not measure purchase intent |

Search volume, conversion, competitor sales, revenue, listing-level review activity and true total digital competition are unavailable from this integration. Listing counts and favorites cannot reconstruct them reliably. Review activity is not present in this endpoint's listing objects.

## Exact decision procedure

1. Normalize the keyword and listing title/tags to lowercase word tokens. A sampled listing is relevant only when **every** keyword token occurs in its title or tags. This is a conservative text rule, not semantic matching.
2. Count relevant listings with `listing_type === 'download'`. Calculate P25, median and P75 prices from those digital results using linear interpolation on sorted prices. These are sample statistics, not market-wide estimates.
3. Mark the sample sufficient for a *comparison* only when at least 30 results were returned, 20 were token-relevant and 10 were relevant digital downloads. These are minimum sample-size guards, not calibrated market success thresholds.
4. Mark the listing evidence fresh only for six hours after retrieval. Each demand record requires the exact keyword, measurement, source, observation date, measurement period and optional target market. Keep records separate; the newest valid one is selected deterministically, while incompatible metrics or markets are never added. Comparable positive and zero observations conflict and force validation. A demand observation over 90 days old or dated in the future cannot produce EXPLORE. Positive demand means only that a sourced observation exceeds zero.
5. A product concept needs audience, problem, format and functional difference. Its gap is a hypothesis until the user cites two relevant digital listings in the live sample and writes a specific observed difference (at least 20 characters). This is a research guard, not proof that the market gap is real.
6. `EXPLORE` needs a positive dated demand observation, fresh and sufficient listing evidence, and an observed difference. `AVOID` needs fresh sufficient listing evidence, the observed difference and a user-confirmed concrete blocker with a source. Every other state returns `VALIDATE`, including missing demand, contradictory observations and provider errors.

The keyword report allows manual research entry. Records persist in browser storage and the JSON export; the app does not fetch external demand for the user. `VALIDATE` is an inconclusive state, not a forecast of success. The algorithm outputs no numerical confidence or estimated sales. A manually entered source or gap observation has not been independently verified by the application.

## Proxy review

## Keyword discovery

The user enters one seed without selecting a category. For each returned listing, physical or digital, `listingRelevance` first tests whether every non-stopword seed token occurs exactly in its title or tags. If that fails, it accepts deterministic synonyms from a small documented dictionary (for example, mom/mother and planner/organizer). Unfamiliar topics still work through exact tokens. The discovery module extracts 2–6 token tags and short title windows, retains only phrases related to the seed, normalizes case/punctuation/simple plurals, and deduplicates by normalized phrase. It groups phrases by a transparent buyer-need, audience, and product-format vocabulary; unmatched words fall back to general or unspecified labels. Synonym substitutions are labelled generated hypotheses. The original observed phrase is never relabelled as generated.

Counts report how many distinct sampled listings contained a phrase. The API returns at most 100 relevance-ranked results, so this is neither market prevalence nor search volume. A candidate is not assessed by the opportunity engine until the user investigates it with its own Etsy query. No discovery frequency enters EXPLORE/VALIDATE/AVOID logic.

When the original sample contains no digital listings, the app can run a separate generated query by appending “digital.” It labels this as a search probe and displays its sample independently. The original physical listing evidence remains visible. The opportunity engine remains specific to digital product hypotheses; its decision is not a verdict about physical products.

## Automatic product hypotheses

The investigated keyword is compared against relevant sampled digital listings. The generator uses observed phrases that appear in at least two sampled listings, with a fallback to the investigated phrase itself when no more specific phrase survives. It proposes up to five distinct audience/need/format combinations. Each concept links the sampled listings supporting its phrase. The comparison records how many relevant sampled listings mention an audience or format term in title/tags. The product direction and possible difference are explicitly hypotheses; missing text in a small sample does not establish an unmet market need. Selecting a concept only pre-fills the editable research form. It supplies neither a verified gap nor a demand observation to the decision engine.

Favorites per listing age would be `favorites / max(ageDays, 30)`, but age and visibility differ greatly between listings. Engagement concentration could be `sum(top 10% favorite counts) / sum(all favorite counts)`, but the relevance-ranked sample is selection biased. Recent entrant traction would compare favorite distributions of newer and older listings, yet it has the same exposure bias. These metrics are excluded from decisions until repeated observations and outcomes show they add information. Listing-count change between dated snapshots would measure supply change only, never demand growth.

## Next evidence to collect

Use a permitted, dated buyer demand observation with query, geography, method and source. Check a proposed digital product direction against actual competitor offerings and record the finding. For historical research, save only compact aggregate snapshots (`keyword`, `queryScope`, `observedAt`, `totalListings`, `sampleSize`, `relevantDigitalCount`, `priceP25`, `priceMedian`, `priceP75`) and retain them only as allowed by the provider terms. A future launch log can record date, price, views, favorites and actual orders; calibrate predictive rules only after enough independent launches for chronological out-of-sample evaluation.
