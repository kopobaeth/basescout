# BaseScout

BaseScout is a Base token risk scanner with a Vercel serverless scan API. Paste a Base token contract address, or use a built-in example, and it returns a compact risk score with human-readable findings.

## What BaseScout Does

BaseScout combines public DEX Screener market data with optional BaseScan contract intelligence through the versioned `/api/v1/report` contract. The legacy `/api/scan` endpoint remains available for compatibility.

It checks:

- Highest-liquidity Base pair for the token
- Up to five Base markets sorted by USD liquidity
- Liquidity, 24h volume, 24h price change, market cap or FDV
- Pair age and 24h transaction count
- Optional contract verification status, deployer, deployment age, supply, and holder count from BaseScan
- Optional GoPlus security intelligence for honeypot, taxes, owner controls, trading restrictions, proxy status, ownership, and source availability
- Server-side Etherscan API access using Base chain ID `8453`
- Server-side security provider access; security APIs are never called directly from the browser
- Recent successful scans stored locally in the browser
- Watchlist tokens stored locally in the browser
- Vercel Analytics page tracking and PostHog product events when configured

The result is a first-pass risk score, market list, watchlist controls, and transparent scoring reasons.

## Versioned Report API

`GET /api/v1/report?address=0x...` is the authoritative public read contract for BaseScout. Risk Engine `2.0.0` runs on the server, so the web app and future integrations consume the same score instead of recalculating it in the browser.

A successful response includes:

- `schemaVersion` for the HTTP response contract
- `scoreVersion` for the scoring algorithm
- Canonical lowercase token address and Base chain ID `8453`
- Overall, market, and contract risk; confidence and transparent evidence
- Primary and alternative Base markets
- BaseScan and GoPlus intelligence
- Per-provider availability and timestamps
- `requestId`, `generatedAt`, and a disclaimer

Errors use the same versioned envelope with a stable code, HTTP status, retryability flag, and request ID. Successful reports use the existing short shared-cache policy; error responses use `private, no-store`.

Example:

```bash
curl "https://basescout.app/api/v1/report?address=0x940181a94a35a4569e4529a3cdfb74e38fd98631"
```

## Base MCP Plugin

[`integrations/base-mcp/plugins/basescout.md`](integrations/base-mcp/plugins/basescout.md) is an upstream-spec-conforming read-only plugin candidate for the official Base MCP skill.

It teaches an agent to:

- Call BaseScout's versioned report API before an optional Base token interaction
- Validate the schema, chain, contract address, timestamps, and score version
- Present detected risk separately from data confidence
- Treat provider and token metadata as untrusted data
- Stop on critical findings and require stricter confirmation for high-risk or insufficient-data reports
- Hand an explicitly confirmed swap to the official Base MCP `swap` tool and Base Account approval flow

BaseScout does not become a second wallet MCP server and never initiates writes itself. The candidate plugin is not yet an official Base integration. Hosted chat surfaces also require `basescout.app` to be added to Base MCP's `web_request` allowlist; coding harnesses can use their own HTTP/fetch capability while the integration is under review. Because `base/skills` currently limits direct contributions to the Base core team, upstream adoption starts with a proposal issue rather than an unsolicited PR.

Official upstream proposal: [`base/skills#146`](https://github.com/base/skills/issues/146)

See [`integrations/base-mcp/README.md`](integrations/base-mcp/README.md) for setup, validation, and publication requirements.

## Why It Exists

Base has many fast-moving token launches. Traders often need a quick way to identify obvious risk signals before opening a chart, sizing a trade, or doing deeper research.

BaseScout is designed to make the first scan faster. It is not a replacement for manual review.

## Shareable Examples

Built-in examples:

- AERO: `0x940181a94A35A4569E4529A3CDfB74e38FD98631`
- VIRTUAL: `0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Low-liquidity placeholder: intentionally disabled until a reviewed public example is selected

## How Risk Score Works

The current scoring contract is Risk Engine `2.0.0`. Scores run from `0` to `100`, where a higher number means more detected risk.

BaseScout shows four score blocks:

- Overall Risk Score
- Market Risk
- Contract Risk
- Data Confidence

Market and contract risk start at `28` and are clamped between `0` and `100`. The overall score is weighted from market risk (`55%`) and contract risk (`45%`). Data confidence is reported separately and never changes risk.

DEX Screener factors:

- Liquidity above `$500k`: positive strong-liquidity signal
- Liquidity `$50k-$500k`: caution signal
- Liquidity below `$50k`: `+18` risk
- Pair age above `30 days`: positive established-pair signal
- Pair age `3-30 days`: caution signal
- Pair age below `3 days`: `+18` risk
- 24h transactions above `1,000`: positive activity signal
- 24h transactions `100-999`: caution signal
- 24h transactions below `100`: danger signal
- Volume/liquidity above `10x`: `+9` risk
- Market cap or FDV/liquidity above `80x`: danger signal
- Market cap or FDV/liquidity above `25x`: caution signal
- Absolute 24h price change above `80%`: danger volatility signal
- Absolute 24h price change above `30%`: caution volatility signal
- Missing liquidity, age, transaction, volume, valuation, or volatility data lowers confidence without changing market risk

Optional BaseScan factors:

- Verified contract: positive contract signal
- Unverified contract: danger signal
- Contract age below `3 days`: danger signal
- Contract age `3-30 days`: caution signal
- Holder count below `100`: `+12` risk
- Holder count `100-1,000`: `+6` risk
- Missing verification, deployer, age, supply, or holder count lowers confidence without changing contract risk

Security intelligence factors:

- Confirmed honeypot, cannot-sell finding, or blocking `100%` sell tax: critical signal and a minimum `75/100` overall risk
- Owner can mint: high-risk signal
- Blacklist capability: high-risk signal
- Sell tax above `10%`: high-risk warning; `100%` is critical
- Upgradeable proxy: warning signal
- Trading restrictions, whitelist, pausable transfers, or high transfer/buy taxes: warning signals
- Verified/open-source contract: positive signal only and counted once across providers
- Security provider outage or missing fields lowers confidence and does not imply lower risk

Verdicts:

- Lower risk
- Moderate risk
- High risk
- Critical risk
- Insufficient data

Confidence:

- High: at least `75%` of the fixed 25-check registry completed
- Medium: at least `45%` completed
- Low: fewer than `45%` completed

Missing data is never treated as automatically safe or as a confirmed negative signal. When coverage is too low to support a lower or moderate rating, BaseScout shows `Insufficient data`.

## Reliability Boundaries

- The browser gives a scan up to 15 seconds; the server caps all provider work to a shared 12-second deadline.
- Starting a new scan aborts the previous request, and navigating to Home or Trending invalidates any in-flight scan result.
- Native assets and the zero address are not accepted as token contracts. Trending can still show a native side, but only contract-backed sides are scannable.
- Successful API responses may use short shared-cache windows. Validation, provider, and server errors use `private, no-store` so transient failures are not replayed from shared caches.
- A confirmed `cannot_sell` provider flag is treated as critical even when the separate honeypot field is missing.
- Vercel rewrites `/api/v1/report` to the self-contained `/api/scan` Function in report mode, avoiding runtime dependencies between separate Function entrypoints.

## Current Limitations

- MVP serverless API; there is no database, queue, or long-lived cache.
- The Etherscan API key is server-only and should not use a `VITE_` prefix.
- Recent scans are browser-local and clear when localStorage is cleared.
- Watchlist entries are browser-local and clear when localStorage is cleared.
- PostHog event payloads send token symbols and shortened addresses only.
- DEX Screener indexing can lag new pairs.
- BaseScan holder count may require a paid API plan.
- Holder count, deployer, supply, or creation data may be unavailable even with a key.
- Risk score is heuristic and should not be treated as a definitive safety rating.
- The app does not prove whether contract logic is malicious; it only reports automated provider signals and public metadata.
- Security intelligence depends on third-party provider coverage and may be incomplete, delayed, or wrong.

## Run Locally

```bash
npm install
npm run dev
```

The Vite development server handles `/api/v1/report` and `/api/scan` locally. To test the exact Vercel Functions runtime, use:

```bash
npx vercel dev
```

Build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Configure BaseScan API Key

BaseScan checks are optional. Without a key, BaseScout still works with DEX Screener and shows a neutral `BaseScan checks unavailable` note.

To enable the BaseScan layer:

1. Create an API key from the BaseScan/Etherscan API dashboard.
2. Copy `.env.example` to `.env`.
3. Set:

```bash
ETHERSCAN_API_KEY=your_api_key_here
```

BaseScout uses the unified Etherscan API V2 with Base chain ID `8453`. Keep this variable server-only and do not use a Vite-exposed prefix.

## Configure Security Intelligence

BaseScout requests token security data from the Vercel serverless backend only. The browser never calls the security provider directly.

Set this optional server-only variable when using an authenticated GoPlus setup:

```bash
GOPLUS_API_KEY=your_goplus_api_key_here
```

The scan still works if the provider times out, rejects the request, or returns incomplete data. In that case, BaseScout returns partial results and marks security checks as unknown.

## Configure Analytics

Vercel Analytics is installed through `@vercel/analytics` and rendered once in the React root.

PostHog is optional. To enable product event tracking, set:

```bash
VITE_POSTHOG_KEY=your_project_api_key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

Tracked events:

- `scan_clicked`
- `scan_success`
- `scan_failed`
- `example_token_clicked`
- `copy_pair_address`
- `open_basescan`
- `open_dexscreener`
- `market_opened`
- `watchlist_added`
- `watchlist_removed`
- `watchlist_rescan`
- `security_section_viewed`
- `critical_warning_displayed`
- `security_check_unavailable`

Event payloads avoid full token addresses. They include the token symbol when available and a shortened address such as `0x1234...abcd`.

## Deployment Notes

Vercel:

- Set `ETHERSCAN_API_KEY` in Project Settings if using BaseScan checks.
- Use the default Vite build command: `npm run build`.
- Use `dist` as the output directory.

Netlify:

- Requires equivalent serverless function routes for `/api/v1/report` and legacy `/api/scan`.
- Set `ETHERSCAN_API_KEY` in Site configuration if using BaseScan checks.
- Build command: `npm run build`.
- Publish directory: `dist`.

Static hosting:

- Run `npm run build`.
- Uploading only `dist` is not enough because the report API must run on a serverless host.

## Changelog

### Unreleased

- Opened `base/skills#146` for native plugin review and hosted `basescout.app` allowlisting
- Aligned the BaseScout plugin with the canonical Base MCP plugin specification, section order, risk enum, routing references, and contribution scope
- Added a candidate read-only Base MCP plugin that checks BaseScout risk and confidence before optional wallet actions
- Added strict address, schema, staleness, retry, prompt-injection, and explicit-confirmation rules for agent use
- Documented the Base MCP allowlist requirement and the separation between BaseScout research and Base Account approvals
- Added regression checks for the plugin metadata, report contract, and security policy
- Added authoritative `GET /api/v1/report` with versioned success and error contracts
- Moved Risk Engine `2.0.0` execution to the server and migrated the web app to consume its report
- Added strict runtime validation for report, market, contract, security, evidence, and provider fields
- Added canonical lowercase addresses, request IDs, provider status metadata, and consistent cache semantics
- Preserved `/api/scan` as a backwards-compatible normalized provider endpoint
- Added report contract and handler regression tests
- Served the versioned report through the proven self-contained scan Function to prevent Vercel runtime module-loading failures
- Added scan request supersession and navigation cancellation to prevent stale results from overwriting the current route
- Added a shared server-side provider deadline below the browser timeout
- Rejected zero-address/native assets as token contracts across manual, routed, API, and Trending scan entry points
- Prevented non-success API responses from being stored in shared caches
- Fixed `cannot_sell` normalization when the provider omits the honeypot field
- Added reliability regression tests for request coordination, address policy, deadlines, cache headers, and security normalization

### v0.7

- Added server-side GoPlus Token Security API integration for Base
- Normalized honeypot, tax, mint, blacklist, whitelist, pause, trading restriction, proxy, ownership, owner privilege, and source availability checks
- Added Security Intelligence UI with Pass, Warning, Critical, and Unknown statuses
- Updated Contract Risk scoring with critical and warning security findings
- Added security analytics events
- Added basic TypeScript tests for security-driven contract risk scoring

### v0.6

- `/api/scan` returns all normalized Base pairs in `pairs` while preserving `pair` as the highest-liquidity primary pair
- Added Markets section with primary, low-liquidity, and new-pair markers
- Added local watchlist with add, remove, and rescan actions
- Replaced the single unexplained score with Overall Risk Score, Market Risk, Contract Risk, and Data Confidence
- Added completed and unavailable check counts
- Added analytics events for market opens and watchlist actions

### v0.5

- Added PostHog initialization using `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`
- Confirmed Vercel Analytics is installed and mounted once
- Added analytics events for scans, example clicks, copy, BaseScan opens, and DEX Screener opens
- Added typed UI messages for invalid addresses, no Base liquidity pair, API timeout, rate limit, partial contract intelligence failure, and unexpected server errors
- Added loading skeletons and duplicate-scan prevention
- Added local recent scan history with latest 10 successful scans, rescan, and clear history controls

### v0.4

- Serverless `/api/scan` endpoint for DEX Screener and Etherscan requests
- Server-only `ETHERSCAN_API_KEY`
- Removed public Vite API key handling
- 120-second API cache headers
- Client now consumes normalized scan API responses

### v0.3

- Optional BaseScan contract intelligence layer
- Source verification scoring
- Contract deployer and creation age display
- Token supply display when available
- Holder count scoring when available
- Neutral fallback when BaseScan key or data is unavailable

### v0.2

- Example Base token buttons for AERO, VIRTUAL, and USDC
- Copy pair address action
- BaseScan token link
- DEX Screener pair link
- Loading and empty states for scanner panels
- Threshold-specific finding explanations

## Disclaimer

BaseScout provides automated signals, not financial or security guarantees. It is a first-pass scanner for public market, contract, and third-party security metadata. Always DYOR before trading, investing, or interacting with any token contract.
