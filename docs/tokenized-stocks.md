# Tokenized stock research

`/stocks` lists 13 Coinbase tokenized equity addresses from the official Base documentation, checked 2026-09-09:
https://docs.base.org/specifications/b20/tokenized-stocks-on-base

`/stocks/:address` provides address identity, issuer links, per-pool market context, and B20 interpretation. The catalog is a reviewed snapshot, not an automatic discovery feed. Matching is by full address; symbols and the B20 prefix alone confer no trust. Update the catalog when the official list changes.

`GET /api/stocks?address=...` accepts only catalog entries. DEX Screener supplies the highest-liquidity matching Base pool with the requested asset on the base side. Its `priceUsd` is never reused for a quote-side match. Market price is per token and is not multiplied again. Liquidity and volume refer to one selected pool, not total asset liquidity or BaseScout processed volume.

The B20 `multiplier()` read is pinned to a Base block, uses 18-decimal fixed-point formatting, and never defaults to 1. Configure server-only `BASE_RPC_URL` for a production RPC; otherwise it uses the public Base endpoint. Provider calls have timeouts and partial failure handling. Results cache for 30 seconds, with no HTTP caching; the UI warns after 2 minutes. Retrieval time does not imply recent trade activity.

This release is read-only: no trading links, swaps, wallet eligibility verdict, transfer simulation, pause/policy monitoring, or oracle premium calculation. It does not claim the asset is safe. Issuer restrictions remain relevant. Known stock addresses entered into the scanner route to Stocks; the report API returns HTTP 422 `unsupported_asset` rather than an ERC-20 risk score.

Saved stocks use a separate browser-local list. Stock analytics reuse existing opt-out handling. No wallet data is collected.

## Validation

- `npm run build`
- `npm test` (includes identity, wrong-chain/quote-side rejection, malformed data, provider failures, and B20 scoring exclusion)
- Preview checklist: desktop and mobile, Dark/Light/System, company/address search, saved filter and reload persistence, direct stock URLs, invalid address, refresh and provider-unavailable states, scanner-to-stock navigation.
