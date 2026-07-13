# BaseScout

BaseScout is a Base token risk scanner with a Vercel serverless scan API. Paste a Base token contract address, or use a built-in example, and it returns a compact risk score with human-readable findings.

## What BaseScout Does

BaseScout combines public DEX Screener market data with optional BaseScan contract intelligence through `/api/scan`.

It checks:

- Highest-liquidity Base pair for the token
- Liquidity, 24h volume, 24h price change, market cap or FDV
- Pair age and 24h transaction count
- Optional contract verification status, deployer, deployment age, supply, and holder count from BaseScan
- Server-side Etherscan API access using Base chain ID `8453`
- Recent successful scans stored locally in the browser
- Vercel Analytics page tracking and PostHog product events when configured

The result is a first-pass risk score and a list of concrete findings.

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

The score starts at `72` and is clamped between `4` and `96`.

DEX Screener factors:

- Liquidity above `$500k`: `+5`
- Liquidity `$50k-$500k`: `-9`
- Liquidity below `$50k`: `-18`
- Pair age above `30 days`: `+5`
- Pair age `3-30 days`: `-9`
- Pair age below `3 days`: `-18`
- 24h transactions above `1,000`: `+5`
- 24h transactions `100-999`: `-9`
- 24h transactions below `100`: `-18`
- Volume/liquidity above `10x`: `-9`
- Market cap/liquidity above `80x`: `-18`
- Market cap/liquidity above `25x`: `-9`
- Absolute 24h price change above `80%`: `-18`
- Absolute 24h price change above `30%`: `-9`

Optional BaseScan factors:

- Verified contract: `+5`
- Unverified contract: `-18`
- Contract age below `3 days`: `-18`
- Contract age `3-30 days`: `-9`
- Holder count below `100`: `-12`
- Holder count `100-1,000`: `-6`

Verdicts:

- `75+`: Looks tradable
- `45-74`: Proceed carefully
- Below `45`: High risk

## Current Limitations

- MVP serverless API; there is no database, queue, or long-lived cache.
- The Etherscan API key is server-only and should not use a `VITE_` prefix.
- Recent scans are browser-local and clear when localStorage is cleared.
- PostHog event payloads send token symbols and shortened addresses only.
- DEX Screener indexing can lag new pairs.
- BaseScan holder count may require a paid API plan.
- Holder count, deployer, supply, or creation data may be unavailable even with a key.
- Risk score is heuristic and should not be treated as a definitive safety rating.
- The app does not detect honeypots, transfer taxes, ownership controls, proxy upgrade risk, or malicious contract logic beyond available BaseScan metadata.

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

BaseScout is not financial advice. It is a first-pass scanner for public market and contract metadata. Always DYOR before trading, investing, or interacting with any token contract.
