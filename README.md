# agent-pay

> Reference stack: L402 (HTTP 402 + Lightning) + DID-signed invoices for agent-to-agent payments.

## What

`agent-pay` is **not a new payment protocol**. It is a small reference implementation that composes existing, mature primitives — [L402](https://github.com/lightninglabs/L402), Lightning, and DID-signed invoices — into a clean "charge another agent for an API call" pattern.

Concretely: a server middleware that emits `402 Payment Required` with a DID-signed Lightning invoice, and a client library that verifies the DID, pays via NWC / LND REST, and retries with `Authorization: L402 <macaroon>:<preimage>`.

## Status

**0.0 — design phase.** Draft spec in [SPEC.md](./SPEC.md). No code yet. Scope intentionally narrow — bring your own Lightning node.

## The gap

L402 is mature and Lightning-Labs-dominant: `aperture`, `lightning-agent-tools`, Alby `js-lightning-tools`, `l402` npm package, PaidMCP. Every existing implementation uses raw macaroons with **no agent-identity binding**. Google's AP2 (Sep 2025) chose x402 / stablecoins via Coinbase, not Lightning — leaving a Lightning-flavored AP2 interop lane empty.

No canonical repo implements "agent A signs a Lightning invoice with a `did:key` / `did:web` identity, agent B verifies the DID, pays, and presents preimage + DID-bound proof as an AP2-style PaymentMandate." That is the gap `agent-pay` fills.

## Scope — v0.1 (intentionally tight)

**In scope**

- Server middleware (Express / Fastify) emitting DID-signed `402` responses
- Client fetch wrapper verifying DID, paying, retrying
- `did:key` signer (≤ 200 LoC wrapping `@noble/curves`)
- Integration with NWC (Nostr Wallet Connect) **or** LND REST
- Polar-based regtest harness
- AP2 PaymentMandate adapter (stretch)

**Out of scope**

- A new payment protocol
- Embedding a full Lightning node (LDK-node is a stretch goal, not v0.1)
- A wallet UI
- Custody solutions
- Competing with AP2 — we want interop, not replacement

## Dependencies and companions

- **Depends on:** `agent-id` (DIDs for invoice signers), a running Lightning node (BYO).
- **Companion to:** `agent-ask` (ratings / reputations), `agent-toolprint` (receipts for paid tool calls).

## Validation scoring

| Criterion | Score |
|---|---|
| Scope | 4 |
| Composes primitives | 5 |
| Standalone | 2 *(requires running a Lightning node)* |
| Clear gap | 4 |
| Light deps | 3 |
| Testability | 4 |
| **Total** | **22/30** |

Verdict: **MEDIUM — borderline easy-picking.** Easy only if scoped as "BYO node" (NWC or LND REST). Full validation: [`../research/validations/agent-pay.md`](../research/validations/agent-pay.md).

## Prior art

- **L402 spec (bLIP-0026)** — macaroons + preimages, no DID binding.
- **`aperture`** — production reverse proxy, LND-only, no DID.
- **`lightning-agent-tools`** (Feb 2026) — agent bundle, still no DID-bound invoices.
- **Alby `fetchWithL402`, npm `l402`** — client helpers, no DID.
- **PaidMCP** — glues L402 to MCP servers.
- **AP2** — payment mandates on x402 / stablecoins; our Lightning path complements.

## Implementation skeleton

Single repo, ~1.5k LoC TypeScript. Components:

- **`@agent-pay/server`** — Express / Fastify middleware emitting `402 Payment Required` with BOLT11 invoice + `WWW-Authenticate: L402` + a `did-invoice` JWS header binding `{ invoice_hash, did, price, resource }`.
- **`@agent-pay/client`** — fetch wrapper that resolves DID, verifies JWS, pays via NWC or LND REST, retries with `Authorization: L402 <macaroon>:<preimage>`.
- **`@agent-pay/did-signer`** — tiny `did:key` signer wrapping `@noble/curves`.

**Dependencies:** `bolt11`, `@getalby/sdk` (NWC), `did-resolver`, `jose`.

## Conformance tests (polar regtest harness)

1. Unsigned invoice → client rejects.
2. Valid DID-signed invoice → paid → 200 with receipt.
3. Replayed preimage → rejected.

Stretch: AP2-PaymentMandate adapter so Google-AP2 agents consume the same flow.

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Research

Landscape, prior art, scoring rationale: [`../research/`](../research/).
