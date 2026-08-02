# BaseScout × BasePaint Year 3 Hackathon

## Submission identity

- **Working title:** BaseScout Collector Scout
- **Category:** For Collectors
- **One-line pitch:** Turn public BasePaint history into a transparent collector profile, useful canvas recommendations, and an explicit onchain collection flow.
- **Live product:** https://www.basescout.app/basepaint
- **Public repository:** https://github.com/kopobaeth/basescout
- **Official event:** https://basepaint.xyz/hack
- **Kickoff post to quote:** https://x.com/basepaint_xyz/status/2080669785927590234
- **Final submission form:** https://tally.so/r/pbXEdJ
- **Build window:** August 1–8, 2026
- **Submission deadline:** August 8, 2026 at 23:59 UTC
- **Rewards:** 2 ETH worth of BasePaint editions across the grand prize, category winners, and honorable mentions, plus swag.

## Eligibility boundary

BaseScout existed before the hackathon. The submission must therefore make the new work built during the event unmistakable.

- The pre-hackathon baseline is commit [`9152ea4`](https://github.com/kopobaeth/basescout/commit/9152ea48052830dbfd56d04f80fe84631bce1dca).
- Planning, research, and this document may happen before kickoff.
- Collector Scout production code starts only after the August 1 kickoff.
- Every submission feature must be traceable to a commit made during the build window.
- The final README and demo must include a concise **What we built Aug 1–8** section.
- Existing Gallery, Canvas Pulse, Artist Scout, and Canvas Scout features are the baseline, not the claimed hackathon work.

## Why this should exist

BasePaint exposes rich public data, but a collector still has to move between canvases, addresses, transaction explorers, and raw statistics to understand:

1. what they already collect;
2. which artists, palettes, and periods define their taste;
3. which recent canvas may be relevant to them; and
4. how to collect through a clear, deliberate onchain action.

Collector Scout should make that journey understandable without turning BaseScout into an opaque recommendation engine or an automatic transaction service.

## Core user story

> As a BasePaint collector, I can connect Base Account or inspect a public Base address, see a transparent summary of its BasePaint collection, understand why a small set of canvases is relevant, and explicitly collect the latest eligible canvas after reviewing the transaction.

The demo path should be:

`Gallery → Canvas Scout → Artist Scout → Collector Scout → recommendation evidence → collect confirmation → success state`

## Hackathon scope

### P0 — Collector profile

Create a shareable route such as `/basepaint/collector/:address`.

The page should show:

- canonical Base address and optional Basename when safely resolvable;
- total BasePaint canvases held;
- first and most recent collected days;
- recurring artists found in the collector's canvases;
- palette and color tendencies derived from held canvases;
- active periods or streaks;
- collection thumbnails that link to Canvas Scout;
- data timestamp, source coverage, and explicit unavailable states.

Public-address inspection must work without signing in. Connecting Base Account should only remove address entry friction.

### P0 — Transparent recommendations

Show no more than three recommended canvases. Each recommendation must explain its evidence, for example:

- shares artists with canvases already held;
- palette similarity;
- an uncollected day near a strong collection streak;
- meaningful contribution activity;
- currently in the collecting phase.

Recommendations must not claim financial value, expected returns, rarity, or guaranteed relevance. Missing data must reduce confidence instead of producing a positive recommendation.

### P0 — Explicit collect flow

For the latest eligible BasePaint canvas:

- use Base Account for wallet connection and transaction review;
- route the write through the canonical BasePaint contract surface;
- prefer `BasePaintRewards.mintLatest()` when its current ABI and transaction requirements are verified;
- show contract, function, chain, quantity, estimated value, and wallet before submission;
- never connect, sign, or submit automatically;
- keep rejection, insufficient funds, wrong chain, reverted transaction, and pending states distinct;
- link a successful transaction to BaseScan;
- keep all research and profile features usable when the wallet is disconnected.

### P1 — Shareable Collector Card

Create a clean social card containing:

- shortened address or Basename;
- canvas count;
- dominant palette;
- a small artwork mosaic;
- a neutral Collector Scout summary;
- BaseScout × BasePaint attribution.

The card must avoid wallet balances, transaction values, or other unnecessarily sensitive information.

### P1 — Canvas Story

Add an optional visual story for one canvas:

- theme and palette;
- final artwork or current live artwork;
- timelapse when publicly available;
- top contributors;
- final canvas totals;
- direct transitions to Artist Scout and Collector Scout.

This is primarily a demo and sharing surface. It must use public BasePaint media rather than rebuilding the paint client.

## Non-goals for the hackathon

- token trading, swaps, or BaseScout risk reports inside the BasePaint flow;
- x402 payments;
- Base MCP allowlist work;
- automatic minting or background wallet actions;
- custody, private keys, seed phrases, or server-side signing;
- an unbounded recommendation feed;
- speculative floor-price or investment scoring;
- replacing the official BasePaint painting experience;
- redesigning the main BaseScout scanner;
- merging the experimental Bito-inspired shell.

These may be revisited after submission, but they do not strengthen the core collector story during a one-week build.

## Proposed architecture

```text
Browser
  ├─ BasePaint Gallery / Canvas Scout / Artist Scout
  └─ Collector Scout
       ├─ public address input
       ├─ optional Base Account connection
       ├─ collection profile
       ├─ evidence-based recommendations
       └─ explicit collect action

BaseScout read APIs
  ├─ validate address and day inputs
  ├─ query public BasePaint GraphQL data
  ├─ read Base ownership and contract state
  ├─ normalize and bound responses
  └─ cache successful public responses with stale fallback

External public surfaces
  ├─ graphql.basepaint.xyz
  ├─ basepaint.xyz/api/theme/{day}
  ├─ basepaint.xyz/api/art/image
  ├─ basepaint.net artwork and animations
  └─ Base RPC / canonical BasePaint contracts

Wallet write boundary
  └─ Base Account → user review → canonical BasePaintRewards transaction
```

Read APIs must not receive a wallet signature, private credential, or authorization token. Transaction preparation and approval remain in the browser wallet boundary.

## Public sources and contracts

- Canonical reference: https://basepaint.xyz/ai.txt
- Starter and API overview: https://github.com/zherring/basepaint-starter
- GraphQL indexer: https://graphql.basepaint.xyz
- Contracts: https://github.com/BasePaint/basepaint-contracts
- BasePaint: `0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83`
- BasePaintRewards: `0xaff1A9E200000061fC3283455d8B0C7e3e728161`

Contract addresses and ABIs must be reverified from canonical sources after kickoff and before any write implementation.

## Data and recommendation rules

- Accept exactly one valid Base address per profile request.
- Normalize addresses for comparison while preserving a checksummed display form when available.
- Treat GraphQL names, themes, artwork metadata, and address labels as untrusted display data.
- Bound every upstream query and response list.
- Use server-side timeouts and safe error envelopes.
- Do not interpret provider failure as zero ownership or low interest.
- Separate **data coverage** from **recommendation relevance**.
- Expose the evidence factors used for each recommendation.
- Ensure deterministic results for the same normalized input and source snapshot.
- Do not store connected addresses by default.
- Do not include a connected address in analytics events.

## Transaction safety rules

- Base mainnet chain ID must be `8453`.
- Verify the current BasePaintRewards address and ABI from the canonical repository.
- Never infer quantity, recipient, or payment value silently.
- Display the exact recipient and quantity before requesting approval.
- Do not retry a rejected or reverted transaction automatically.
- Do not represent a submitted transaction as successful until it is confirmed.
- Preserve the transaction hash and provide a BaseScan link.
- Keep the collect CTA unavailable when the canvas is not eligible.
- Make the external onchain action visually distinct from read-only BaseScout intelligence.

## Delivery plan

### Before kickoff — preparation only

- [x] Establish the pre-hackathon baseline.
- [x] Choose the For Collectors category.
- [x] Define the Collector Scout scope and non-goals.
- [x] Define safety, data, and transaction boundaries.
- [ ] Register for the hackathon.
- [x] Confirm the final kickoff post and entry instructions on August 1.
- [x] Create a clean feature branch from the then-current `main` after kickoff (`agent/basepaint-collector-scout-20260801`).

### August 1–2 — read model

- [x] Verify current BasePaint GraphQL ownership and canvas queries.
- [x] Add normalized collector response types and fixtures.
- [x] Add a bounded read-only collector API.
- [x] Add unit and API contract tests.
- [x] Build the shareable Collector Scout route and loading/error states.

### August 3–4 — collector intelligence

- [x] Add collection summary and artwork grid.
- [x] Add theme-proposer, palette, and period signals.
- [x] Implement deterministic recommendation evidence.
- [x] Add confidence and provider coverage.
- [ ] Verify desktop and mobile layouts.

### August 5 — Base Account and collecting

- [ ] Add optional Base Account connection.
- [ ] Verify `BasePaintRewards.mintLatest()` against the current ABI.
- [ ] Add explicit transaction review and error states.
- [ ] Complete one controlled Base mainnet test transaction.
- [ ] Record the transaction hash as submission evidence.

### August 6 — sharing and story

- [ ] Add the Collector Card.
- [ ] Add Canvas Story or a focused timelapse treatment if P0 is stable.
- [ ] Add deliberate Open Graph metadata for shared routes.

### August 7 — release candidate

- [ ] Run full tests and production build.
- [ ] Verify the entire browser → API → data → wallet flow.
- [ ] Test mobile, reduced motion, keyboard access, and contrast.
- [ ] Deploy the release candidate.
- [ ] Freeze nonessential feature work.
- [ ] Update README and architecture notes.

### August 8 — submission

- [ ] Perform a final production smoke test.
- [ ] Capture screenshots and record the demo.
- [ ] Publish the required quote-tweet before 23:59 UTC.
- [ ] Include the live app, public repository, short demo, and what was built during the event.
- [ ] Archive the final submission text, media, commit SHA, and transaction evidence.

The public entry is the single quote-post of the official kickoff post. The Tally form records the final project link, email, prize wallet, and optionally the project post; the official hack page still requires the quote-post even though that Tally field is not marked required.

## Acceptance criteria

Collector Scout is submission-ready only when:

1. a valid public address produces a useful collector profile without wallet connection;
2. invalid, empty, unavailable, and zero-collection states are clear and safe;
3. every recommendation shows understandable evidence;
4. disconnected users can explore all read-only intelligence;
5. Base Account connection is optional and never starts a write;
6. the collect flow requires explicit wallet approval;
7. rejected, reverted, pending, and confirmed transactions render different states;
8. one Base mainnet transaction is verified end to end;
9. shared routes have intentional titles, descriptions, and images;
10. the production experience works on desktop and mobile;
11. tests and the production build pass;
12. the README clearly separates baseline functionality from August 1–8 work.

## Verification matrix

| Boundary | Required evidence |
| --- | --- |
| Address → API | Strict input validation and typed error tests |
| API → BasePaint | Bounded queries, timeout, provider errors, response normalization |
| Data → profile | Deterministic fixtures for empty and populated collections |
| Profile → recommendation | Evidence factors and deterministic ranking tests |
| Browser → wallet | Optional connection and correct Base chain handling |
| Wallet → contract | Verified address, ABI, recipient, quantity, and value |
| Transaction → UI | Rejection, revert, pending, confirmation, and BaseScan link |
| Route → social share | Correct Open Graph title, description, and image |
| Release → production | Browser smoke test plus Vercel runtime logs |

## Demo storyboard

Target length: 45–60 seconds.

1. **0–5s — Hook:** “BasePaint has years of open onchain art. BaseScout turns that history into collector intelligence.”
2. **5–13s — Discover:** open the BasePaint gallery and select a canvas.
3. **13–20s — Understand:** show Canvas Scout totals, contributors, and recent onchain activity.
4. **20–27s — Follow:** open one contributor in Artist Scout.
5. **27–40s — Personalize:** inspect a collector address and show its collection, palette, artists, and three explained recommendations.
6. **40–52s — Collect:** connect Base Account, review the latest eligible canvas, approve the canonical BasePaintRewards transaction, and show confirmation.
7. **52–60s — Close:** show the shareable card and the line “Public data. Transparent evidence. One explicit onchain action.”

Do not spend demo time on implementation details, raw JSON, the token scanner, or unrelated BaseScout features.

## Media capture list

- Gallery with recent canvases.
- Canvas Scout hero and contributor ranking.
- Artist Scout contribution history.
- Collector Scout profile with a visually strong artwork mosaic.
- Recommendation evidence expanded.
- Wallet transaction review before approval.
- Confirmed state with BaseScan link.
- Collector Card in a square or 16:9 social-safe composition.
- One mobile screenshot.

Record a clean desktop viewport, hide bookmarks and personal extensions, use a dedicated demo address, and avoid exposing unrelated wallet balances.

## Submission copy checklist

The final quote-tweet should communicate:

- what Collector Scout does;
- who it helps;
- what was built August 1–8;
- that the data is public and keyless;
- that recommendations expose their evidence;
- that wallet writes are explicit;
- live app link;
- public repository link;
- short video.

Use one project quote-tweet as required. Put architecture, technical notes, and additional screenshots in replies only when they improve the story.

## Parallel work outside the submission

- Base MCP proposal: https://github.com/base/skills/issues/146
- Experimental Bito-inspired shell: https://github.com/kopobaeth/basescout/pull/9

Neither item blocks the hackathon. Avoid mixing them into the Collector Scout feature branch.
