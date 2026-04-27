# agent-pay

> Reference stack: L402 (HTTP 402 + Lightning) + DID-signed invoices for agent-to-agent payments.

## What

`agent-pay` is **not a new payment protocol**. It is a small reference implementation that composes existing, mature primitives — [L402](https://github.com/lightninglabs/L402), Lightning, and DID-signed invoices — into a clean "charge another agent for an API call" pattern.

Concretely: a server middleware that emits `402 Payment Required` with a DID-signed Lightning invoice, and a client library that verifies the DID, pays via NWC / LND REST, and retries with `Authorization: L402 <macaroon>:<preimage>`.

## Status

**0.1.0 — shipped.** [SPEC.md](./SPEC.md) v1.0, reference library in `src/`, conformance vectors in `conformance/`.

## Quickstart

```bash
git clone <repo>
cd agent-pay
bun install
bun run demo
```

Prints: server DID, paid response payload, signed receipt — all in-process, no docker.

```ts
import { Hono } from 'hono'
import { paywall } from '@vlad1987654123/agent-pay/server'
import { fetchWithL402 } from '@vlad1987654123/agent-pay/client'
import { generateKeyPair, didKeyFromPublicKey, MemoryLedger, MemoryNode } from '@vlad1987654123/agent-pay'

const kp = await generateKeyPair()
const did = didKeyFromPublicKey(kp.publicKey)
const ledger = new MemoryLedger()
const node = new MemoryNode({ ledger, name: 'server' })

const app = new Hono()
app.use('/report', paywall({
  serverDid: did, serverPrivateKey: kp.privateKey,
  price_msat: 1000n, resource: '/report',
  lightning: node, tokenSecret: crypto.getRandomValues(new Uint8Array(32)),
}))
app.get('/report', (c) => c.json({ data: '…' }))

const wallet = new MemoryNode({ ledger, name: 'client' })
const res = await fetchWithL402('http://localhost:4242/report', {
  wallet, max_price_msat: 5000n, expectedDid: did,
})
```

### Running against real Lightning (polar regtest)

```bash
./scripts/polar-up.sh
./scripts/polar-fund.sh
export LND_ALICE_URL=https://localhost:8081
export LND_ALICE_MACAROON_HEX=$(docker compose -f docker-compose.polar.yml exec -T alice xxd -p -c 99999 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon | tr -d '\n')
export LND_BOB_URL=https://localhost:8082
export LND_BOB_MACAROON_HEX=$(docker compose -f docker-compose.polar.yml exec -T bob xxd -p -c 99999 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon | tr -d '\n')
export NODE_TLS_REJECT_UNAUTHORIZED=0
AGENT_PAY_INTEGRATION=1 bun test
```

### Conformance

```bash
bun run conformance
```

Outputs: `5/5 vectors passed` (C1×2, C2, C3, C4).

## The gap

L402 is mature and Lightning-Labs-dominant: `aperture`, `lightning-agent-tools`, Alby `js-lightning-tools`, `l402` npm package, PaidMCP. Every existing implementation uses raw macaroons with **no agent-identity binding**. Google's AP2 (Sep 2025) chose x402 / stablecoins via Coinbase, not Lightning — leaving a Lightning-flavored AP2 interop lane empty.

No canonical repo implements "agent A signs a Lightning invoice with a `did:key` / `did:web` identity, agent B verifies the DID, pays, and presents preimage + DID-bound proof as an AP2-style PaymentMandate." That is the gap `agent-pay` fills.

## Scope — v0.1 (intentionally tight)

**In scope (v0.1)**

- Hono server middleware emitting DID-signed `402` responses
- Client `fetchWithL402` wrapper: verifies JWS, enforces price cap + expires_at, pays, retries, verifies receipt
- `did:key` signer (Ed25519, multicodec 0xed01)
- LND REST adapter (BYO node) + in-memory fake for tests
- Polar-style docker-compose regtest harness
- Conformance vectors C1–C4

**Deferred (v0.2)**

- `did:web`, NWC adapter, real macaroon binary format, AP2 PaymentMandate adapter, embedded LDK-node

**Out of scope**

- A new payment protocol
- Embedding a full Lightning node (LDK-node is a stretch goal, not v0.1)
- A wallet UI
- Custody solutions
- Competing with AP2 — we want interop, not replacement
- **Payer privacy** — v0.1 does not implement route-blinding; pair with an LN-onion-capable wallet if payer-side privacy matters (see SPEC §6).

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

## Implementation

Single repo, < 1.2k LoC TypeScript. Components:

- **`agent-pay/server`** — Hono middleware emitting `402 Payment Required` with BOLT11 invoice + `WWW-Authenticate: L402` + a `did-invoice` JWS header binding `{ invoice_hash, did, price, resource, expires_at, nonce }`.
- **`agent-pay/client`** — `fetchWithL402` wrapper that resolves `did:key`, verifies JWS, enforces price/expiry, pays via a `LightningNode`, retries with `Authorization: L402 <token>:<preimage>`, verifies the receipt.
- **`agent-pay/node/lnd-rest`** + **`agent-pay/node/memory`** — `LightningNode` impls.

**Runtime deps (7):** `@noble/ed25519`, `@noble/hashes`, `bolt11`, `canonicalize`, `hono`, `multiformats`, `zod`.

## Conformance vectors

Run `bun run conformance` for `5/5 vectors passed`:

- **C1-missing** — client rejects 402 missing `X-Did-Invoice`.
- **C1-bad-sig** — client rejects 402 with tampered `X-Did-Invoice` JWS.
- **C2** — valid invoice paid → 200 with verified `X-Payment-Receipt`.
- **C3** — server rejects replayed preimage with 401.
- **C4** — client rejects when `invoice_hash` mismatches BOLT11.

All run against the in-memory fake (no docker). The polar harness runs the LND REST adapter integration test (gated by `AGENT_PAY_INTEGRATION=1`).

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Research

Landscape, prior art, scoring rationale: [`../research/`](../research/).
