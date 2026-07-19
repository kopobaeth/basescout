# Base MCP Integration

This directory contains a Base MCP plugin specification for BaseScout:

- [`plugins/basescout.md`](plugins/basescout.md)

The plugin makes BaseScout the read-only research step before a Base MCP wallet action. It calls the public versioned report API, validates the response, presents risk separately from data confidence, and applies stricter confirmation rules for critical, high-risk, or low-coverage reports.

BaseScout does not become a wallet MCP server. Optional swaps and other onchain writes continue through the official Base MCP tools and Base Account approval flow.

## Requirements

1. Connect the hosted Base MCP server at `https://mcp.base.org`.
2. Install the official `base-mcp` skill.
3. Add `plugins/basescout.md` to the skill's `plugins/` directory while testing the candidate integration.

Official setup instructions: <https://docs.base.org/agents/quickstart>

For Codex, the official commands are:

```bash
codex mcp add base-mcp --url https://mcp.base.org/
npx skills add base/skills --skill base-mcp -a codex
```

After installing the skill, copy `plugins/basescout.md` into the installed Base MCP skill's `plugins/` directory and start a new agent session so the updated skill is loaded.

## Hosted-surface requirement

The candidate plugin reads:

```text
GET https://basescout.app/api/v1/report?address=<contract-address>
```

Hosted Base MCP can use `web_request` only for allowlisted partner hosts. `basescout.app` therefore needs Base approval before this plugin works through `web_request` in chat-only consumer surfaces.

Until it is allowlisted, a coding harness can use its own HTTP/fetch capability. When neither route is available, the agent must give the user the exact public report URL or ask for the JSON response; it must not invent a scan result.

## Integration status

This repository contains a candidate plugin, not an official or native Base MCP integration. The current `base/skills` contribution policy limits direct code contributions to the Base core team, so do not open an unsolicited upstream PR. Start with a proposal issue and let maintainers import or explicitly request the plugin diff.

Production adoption requires:

1. Validate the plugin against the current Base MCP plugin specification, tool schemas, and BaseScout report contract.
2. Open a feature proposal in the official [`base/skills`](https://github.com/base/skills) repository with the ready plugin file and live-test evidence.
3. Ask maintainers to provision `basescout.app` in the hosted `web_request` allowlist if the plugin is accepted.
4. Let Base maintainers add the native plugin registry row; partner submissions must not self-register in `SKILL.md`.
5. Test the accepted version in ChatGPT, Codex, Cursor, Claude, and at least one chat-only surface.
6. Keep the plugin's supported `schemaVersion` and `scoreVersion` aligned with BaseScout releases.

## Safety model

- BaseScout is read-only and requires no auth.
- Only an exact Base ERC-20 contract address can be scanned.
- API content is treated as untrusted data, never agent instructions.
- Risk and confidence are always presented separately.
- Critical reports stop wallet writes until a new, exact user override.
- High-risk and insufficient-data reports require a fresh exact confirmation.
- No swap is initiated without an explicit token, input asset, and amount.
- Every wallet write stays inside the Base MCP and Base Account approval flow.
