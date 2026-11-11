# Market Lens / zet-y

Market Lens is a personal, evidence-based Etsy product research tool. Enter a keyword, product idea, Etsy listing URL, or shop URL. **Explore** uses Etsy Open API listing evidence without using Alura credits. It proposes product directions only when at least two relevant downloadable listings provide explicit audience, function, format, and separately advertised features. Every characteristic retains the listing ID and supporting text. Product combinations are hypotheses; a missing feature mention is never treated as proof of a market gap. If the sample is too thin, the app explains why it abstains.

The main result shows product briefs before keyword directions. Each brief states the audience, inferred problem, product format and function, proposed features, citations, demand status, possible difference, uncertainty, and next check. Keyword directions and detailed statistics remain in a secondary view. The user can investigate or save a brief. A direct listing URL retrieves the listing and its shop, then attempts a separate Etsy keyword search for competitor comparison; products in the same shop are not assumed to compete.

Alura is optional. Existing exact-keyword estimates can enrich a brief when available. The detailed investigation view asks for explicit approval before a new Alura lookup of up to two included Free-plan credits. Alura search estimates, Etsy sampled supply, favorites, dated reviews, and purchase hypotheses remain separate. Neither search results nor favorites are counted as sales. No Alura credits are used by the initial Explore action.

`dist/js/research-index.js` keeps up to 12 recent Etsy observations in browser storage for six hours and reuses an observation for 15 minutes. Each record stores the query, timestamp, listing IDs, sampled listing characteristics including a bounded description, related phrases, and source. Shared listing IDs connect searches but do not establish stable ranking or demand. Saved briefs retain their labels after source evidence expires, while listing content is removed.

All Etsy API routes use the same server-side `ETSY_API_KEY` environment variable through `api/etsy-config.js`; no research UI asks for credentials. `api/etsy-source.js` and `api/etsy-keyword.js` use the existing Vercel access gate. The client in `dist/` is static HTML/CSS/JS; there is no build step. Run `npm test` for automated checks.

See [EVIDENCE-INTEGRATION.md](./EVIDENCE-INTEGRATION.md) for verified provider fields and limits, and [ALGORITHM.md](./ALGORITHM.md) for the prior deterministic opportunity engine. The product brief interface does not turn that engine into a synthetic score or claim a sale will occur.

Etsy's [API Terms](https://www.etsy.com/legal/api/) constrain listing-content display and analytics use. The local index removes Etsy listing evidence after six hours. Confirm any broader use with Etsy before distributing research based on its API.
