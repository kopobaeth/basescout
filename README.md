# BaseScout

BaseScout is a Base token risk scanner with a Vercel serverless scan API. Paste a Base token contract address, or use a built-in example, and it returns a compact risk score with human-readable findings.

## What BaseScout Does

BaseScout combines public DEX Screener market data with optional BaseScan contract intelligence through `/api/scan`.

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

BaseScout shows four score blocks:

- Overall Risk Score
- Market Risk
- Contract Risk
- Data Confidence

Market and contract scores start at `72` and are clamped between `4` and `96`. The overall score is weighted from market risk, contract risk, and data confidence.

DEX Screener factors:

- Liquidity above `$500k`: positive strong-liquidity signal
- Liquidity `$50k-$500k`: caution signal
- Liquidity below `$50k`: `-18`
- Pair age above `30 days`: positive established-pair signal
- Pair age `3-30 days`: caution signal
- Pair age below `3 days`: `-18`
- 24h transactions above `1,000`: positive activity signal
- 24h transactions `100-999`: caution signal
- 24h transactions below `100`: danger signal
- Volume/liquidity above `10x`: `-9`
- Market cap or FDV/liquidity above `80x`: danger signal
- Market cap or FDV/liquidity above `25x`: caution signal
- Absolute 24h price change above `80%`: danger volatility signal
- Absolute 24h price change above `30%`: caution volatility signal
- Missing liquidity, age, transaction, volume, valuation, or volatility data lowers confidence and can reduce market score

Optional BaseScan factors:

- Verified contract: positive contract signal
- Unverified contract: danger signal
- Contract age below `3 days`: danger signal
- Contract age `3-30 days`: caution signal
- Holder count below `100`: `-12`
- Holder count `100-1,000`: `-6`
- Missing verification, deployer, age, supply, or holder count lowers confidence and can reduce contract score

Security intelligence factors:

- Confirmed honeypot or cannot-sell finding: critical signal
- Owner can mint: high-risk signal
- Blacklist capability: high-risk signal
- Sell tax above `10%`: high-risk signal
- Upgradeable proxy: warning signal
- Trading restrictions, whitelist, pausable transfers, or high transfer/buy taxes: warning signals
- Verified/open-source contract: positive signal only
- Security provider outage or missing fields lowers confidence and does not imply lower risk

Verdicts:

- Lower risk
- Moderate risk
- High risk
- Critical risk
- Insufficient data

Confidence:

- High: most checks completed
- Medium: meaningful data is present but some checks are missing
- Low: many checks are unavailable

Missing data is never treated as automatically safe.

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

For local testing of `/api/scan`, run the app through Vercel dev:

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

- Requires an equivalent serverless function setup for `/api/scan`.
- Set `ETHERSCAN_API_KEY` in Site configuration if using BaseScan checks.
- Build command: `npm run build`.
- Publish directory: `dist`.

Static hosting:

- Run `npm run build`.
- Uploading only `dist` is not enough for v0.4 because `/api/scan` must run on a serverless host.

## Changelog

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
