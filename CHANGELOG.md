# Changelog

## v0.1.0 — 2026-04-25

Initial release. L402 + DID-signed-invoice reference impl.

### Library surface

- `paywall(opts)` — Hono middleware emitting 402 + `X-Did-Invoice` JWS, validating `Authorization: L402 <token>:<preimage>`, signing `X-Payment-Receipt` on success.
- `fetchWithL402(url, opts)` — client wrapper that resolves `did:key`, verifies JWS, enforces `max_price_msat` and `expires_at`, pays via a `LightningNode`, retries, optionally verifies the receipt.
- `MemoryNode` (in-memory `LightningNode` for tests/demo), `LndRestNode` (polar-regtest-friendly).

### Crypto + encoding

- Hand-rolled compact JWS (EdDSA) over `@noble/ed25519`; JCS-canonical payloads via `canonicalize`.
- Opaque HMAC-SHA256 bearer token (L402 wire-grammar-compatible) — no macaroon library dependency.
- `did:key` Ed25519 (multicodec 0xed01) only.

### Conformance

- C1-missing: client rejects 402 missing `X-Did-Invoice`.
- C1-bad-sig: client rejects tampered `X-Did-Invoice` JWS.
- C2: happy-path roundtrip + receipt verification.
- C3: server rejects replayed preimage.
- C4: client rejects when `invoice_hash` mismatches BOLT11.

### Out of v0.1

- `did:web`, NWC, real macaroon binary format, AP2 PaymentMandate adapter, embedded LDK-node.
- Express/Fastify middlewares (Hono only).
- Status-list revocation, route-blinding (privacy boundary documented in SPEC §6).
