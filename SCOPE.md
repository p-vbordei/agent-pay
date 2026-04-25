# agent-pay — v0.1 Scope

Stage 1 output. Each candidate feature gets: real first-party caller, primary-use-case-dies test, reinvention check, verdict.

Default is DEFERRED. Inclusion requires either (a) an existing first-party caller in the `agent-*` family, or (b) the primary use case dies without it.

---

## IN-V0.1

### Hono server middleware emitting `402 Payment Required` (L402 challenge)
- First-party caller: server side of the demo and every paying-resource consumer.
- Dies without it: yes — this is the server.
- Reinvents: no.

### `X-Did-Invoice` JWS header (binds invoice → server DID)
- First-party caller: every paying client; this is the entire reason this repo exists.
- Dies without it: yes — without this you have plain L402 with no identity binding.
- Reinvents: no — uses RFC 7515 JWS compact serialization.

### `did:key` signer (Ed25519, multicodec 0xed01)
- First-party caller: server identity for the demo and tests.
- Dies without it: yes — DIDs are how the JWS is bound to the server.
- Reinvents: no — W3C did:key, ~30 LoC over `@noble/ed25519` + `multiformats`.

### Hand-rolled compact JWS (alg=EdDSA) sign + verify
- First-party caller: both `X-Did-Invoice` and `X-Payment-Receipt`.
- Dies without it: yes — both signed headers depend on it.
- Reinvents: marginal — `jose` would do it; ~50 LoC over `@noble/ed25519` keeps the family dep tree consistent (matches `agent-id`'s pattern of leaning on `@noble/*` directly).

### JCS canonicalization for JWS payloads (`canonicalize`)
- First-party caller: every JWS payload.
- Dies without it: yes — without canonical bytes, signatures aren't reproducible.
- Reinvents: no — RFC 8785 reference lib.

### BOLT11 invoice parsing (`bolt11`)
- First-party caller: client (verify amount + payment_hash match the JWS); server (read back its own invoice's payment_hash).
- Dies without it: yes — without parsing, server could JWS-claim "100 sats" and BOLT11-charge 10M.
- Reinvents: no.

### `LightningNode` interface (`createInvoice` / `lookupInvoice` / `payInvoice`)
- First-party caller: middleware, conformance fake, LND adapter.
- Dies without it: yes — testability requires a swappable backend.
- Reinvents: no — three typed function signatures, no class registry, no plugin loader.

### LND REST adapter (the one wallet adapter for v0.1)
- First-party caller: the `examples/demo.ts` end-to-end run against polar regtest.
- Dies without it: yes — must ship at least one real adapter.
- Reinvents: no — wraps LND's documented REST endpoints (`/v1/invoices`, `/v1/payreq`, `/v2/router/send`).

### In-memory fake `LightningNode` (tests + conformance)
- First-party caller: every conformance vector except the one explicit polar integration test.
- Dies without it: yes — `bun test` must pass on a clean checkout with no docker.
- Reinvents: no.

### Opaque HMAC bearer token in `Authorization: L402 <token>:<preimage>`
- First-party caller: server (issue at 402; verify on retry); client (echo back).
- Dies without it: yes — required by L402 wire grammar.
- Reinvents: no — see "DEFERRED: real macaroon binary format" below for why an opaque HMAC is sufficient.

### Server-side replay protection (preimage cache, time-bounded)
- First-party caller: SPEC §6 + conformance C3.
- Dies without it: yes — security; preimages are bearer secrets and trivially replayed otherwise.
- Reinvents: no — `Map<payment_hash, { used_at }>` with TTL eviction, in-process.

### `X-Payment-Receipt` JWS (server signs success receipt)
- First-party caller: conformance C2 (clients verify it); future `agent-toolprint` consumers using paid-call receipts as evidence.
- Dies without it: yes — C2 explicitly checks it; it's also the demo's tangible "you got paid, here's the proof" payoff.
- Reinvents: no — same JWS path as `X-Did-Invoice`.

### Client `fetchWithL402(url, opts)` wrapper
- First-party caller: client side of the demo; the public surface for any consumer.
- Dies without it: yes.
- Reinvents: no.

### Client `max_price_msat` enforcement
- First-party caller: SPEC §6 mandatory.
- Dies without it: yes — overcharge attack: server signs a low price in JWS but BOLT11s a high one (or just BOLT11s a high one with no JWS at all).
- Reinvents: no.

### Client `expires_at` enforcement
- First-party caller: SPEC §6 mandatory.
- Dies without it: yes — stale-invoice attack against caching clients.
- Reinvents: no.

### Polar regtest harness (`docker-compose.yml`, single LND-only scenario)
- First-party caller: the LND REST adapter integration test and the live demo.
- Dies without it: no for unit conformance (the fake covers C1–C4); yes for the live end-to-end demo.
- Reinvents: no — polar is the standard. Per the build prompt, this is the family's only Docker.

### Conformance vectors C1–C4 (`conformance/`)
- First-party caller: this repo IS the conformance authority for L402+DID.
- Dies without it: yes — "spec + reference impl + conformance tests" is the product.
- Reinvents: no.

### 20-line demo script (`examples/demo.ts`)
- First-party caller: the sales pitch.
- Dies without it: yes — demos beat docs.
- Reinvents: no.

---

## DEFERRED-TO-V0.2

### `did:web` server signer
- First-party caller: none in v0.1 — `did:key` covers the demo and the dev loop.
- Dies without it: no — SPEC §2 already accepts either; servers MAY pick either.
- Reason to defer: adds an HTTP-fetch resolver path and trust anchoring on TLS for zero present benefit. Promote when a real org-hosted server caller appears.

### NWC wallet adapter (`@getalby/sdk`)
- First-party caller: none — LND REST satisfies the polar harness end-to-end.
- Dies without it: no — second adapter is double surface area for zero extra demo value.
- Reason to defer: natural first community contribution post-v0.1. The `LightningNode` interface is the seam.

### Real macaroon binary format (gomacaroon-compatible)
- First-party caller: none in our 8 repos today.
- Dies without it: no — bLIP-0026 treats the macaroon as opaque to the client. As long as the wire grammar `Authorization: L402 <token>:<preimage>` is preserved and the server can validate its own tokens, the client doesn't care if the bytes are macaroon-encoded.
- Reason to defer: aperture interop is the one thing real-format would buy us, and we don't have an aperture-fronted caller. Promote to IN-V0.2 if/when one appears. Saves ~150 LoC plus a dep.

### AP2 PaymentMandate adapter
- First-party caller: none — none of the 8 agent-* repos consume AP2.
- Dies without it: no — the README explicitly marks it stretch.
- Reason to defer: separate file in v0.2 once a real AP2 consumer surfaces. Until then it's spec-skating.

### Embedded LDK-node wallet
- First-party caller: none.
- Dies without it: no — BYO node is the entire scope-tightening from the validation.
- Reason to defer: probably never. LDK-node belongs in a separate repo if ever.

---

## CUT

### Express middleware adapter
- Build-prompt architecture rule: Hono only.

### Fastify middleware adapter
- Same.

### Wallet UI / key custody
- Explicitly out of scope per README.

### CLI with N flags
- The Hono server IS the binary; the demo is a script. A CLI with flags is corporate-code risk for zero current caller.

---

## Design calls

### One wallet adapter (LND REST), not two
NWC is the more agent-friendly long-term path, but LND REST is what polar gives you natively, and KISS says one. NWC waits for v0.2.

### Opaque HMAC token instead of real macaroon binary format
The L402 wire grammar `Authorization: L402 <macaroon>:<preimage>` treats the macaroon as opaque from the client's perspective. The only argument for real macaroon format is aperture interop, and we have no first-party aperture caller. ~30 LoC HMAC token instead of ~200 LoC macaroon parser plus a dep.

### `did:key` only for the server signer
SPEC §2 already accepts either `did:key` or `did:web`; `did:key` requires no infrastructure and decodes the public key from the DID itself with no HTTP call. Reference impl ships `did:key`; spec stays unchanged.

### Hand-rolled JWS instead of `jose`
Matches the family pattern (`agent-id` similarly hand-rolled `eddsa-jcs-2022` rather than pull `@digitalbazaar/vc`). ~50 LoC over `@noble/ed25519`. The trade is a tiny amount of crypto-adjacent code in our repo for a smaller dep tree and consistency across the family.

### Hono only, not Express/Fastify
Build-prompt architecture rule. README will be updated to reflect this on Stage 6.

### Reimplement `did:key` parsing inline (don't import from `agent-id`)
Each agent-* repo is standalone (no monorepo tooling). The 30 LoC of `did:key` Ed25519 multicodec parsing is duplicated across the family by design — versioning friction beats import friction here.

---

## Runtime dependencies (v0.1)

- `@noble/ed25519` — Ed25519 signatures
- `@noble/hashes` — SHA-256, HMAC
- `canonicalize` — RFC 8785 JCS
- `multiformats` — multibase/multicodec for did:key
- `bolt11` — BOLT11 invoice parsing
- `hono` — server middleware host
- `zod` — runtime validation of internal shapes

Seven packages. No JOSE library, no macaroon library, no VC framework, no NWC SDK in v0.1.

---

## Estimated sizing

| Area | LoC target |
|---|---|
| `src/` total | ≤ 1,200 |
| Largest single file | ≤ 200 |
| Conformance vectors | ≤ 300 |
| Demo (`examples/demo.ts`) | ≤ 60 (server + client + main) |
| Tests | ≤ 800 |

Validation budget was ~1,500 LoC TS for `src/`; the design calls above (drop NWC, drop did:web, drop real macaroon format, drop AP2 adapter, drop JOSE) bring that down comfortably under.
