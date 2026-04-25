import { test, expect } from 'bun:test'
import { Hono } from 'hono'
import { signInvoiceEnvelope } from '../src/envelope.ts'
import { generateKeyPair, didKeyFromPublicKey } from '../src/keys.ts'
import { MemoryLedger, MemoryNode } from '../src/memory-node.ts'
import { paywall } from '../src/server.ts'
import { issueToken } from '../src/token.ts'
import { fetchWithL402 } from '../src/client.ts'

const SECRET = new TextEncoder().encode('thirty-two-byte-test-secret-pad!')

test('fetchWithL402 pays via fake node, retries, parses 200', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const server = new MemoryNode({ ledger, name: 'server' })
  const client = new MemoryNode({ ledger, name: 'client' })

  const app = new Hono()
  app.use(
    '/report',
    paywall({
      serverDid: did,
      serverPrivateKey: kp.privateKey,
      price_msat: 1000n,
      resource: '/report',
      lightning: server,
      tokenSecret: SECRET,
    }),
  )
  app.get('/report', (c) => c.json({ data: 'hello' }))

  const res = await fetchWithL402('http://x/report', {
    wallet: client,
    max_price_msat: 5000n,
    fetch: ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch,
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: string }
  expect(body.data).toBe('hello')
  expect(res.headers.get('x-payment-receipt')).toBeTruthy()
})

test('SPEC §6 overcharging: BOLT11 amount must equal envelope price_msat', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const node = new MemoryNode({ ledger, name: 'server' })
  const wallet = new MemoryNode({ ledger, name: 'client' })

  const app = new Hono()
  app.get('/lying', async (c) => {
    const inv = await node.createInvoice({ amount_msat: 9999n })
    const envelope = await signInvoiceEnvelope({
      bolt11: inv.bolt11,
      did,
      privateKey: kp.privateKey,
      price_msat: 1000n,
      resource: '/lying',
      expires_at: '2030-01-01T00:00:00Z',
      nonce: new Uint8Array(16),
    })
    const tok = await issueToken({
      payment_hash: inv.payment_hash,
      expires_at: '2030-01-01T00:00:00Z',
      secret: SECRET,
    })
    c.header('www-authenticate', `L402 macaroon="${tok}", invoice="${inv.bolt11}"`)
    c.header('x-did-invoice', envelope)
    return c.body(null, 402)
  })

  await expect(
    fetchWithL402('http://x/lying', {
      wallet,
      max_price_msat: 50_000n,
      fetch: ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch,
    }),
  ).rejects.toThrow(/amount-mismatch|mismatches/)
})

test('fetchWithL402 throws when X-Payment-Receipt JWS is tampered', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const server = new MemoryNode({ ledger, name: 'server' })
  const wallet = new MemoryNode({ ledger, name: 'client' })

  const app = new Hono()
  app.use(
    '/tamper',
    paywall({
      serverDid: did,
      serverPrivateKey: kp.privateKey,
      price_msat: 1000n,
      resource: '/tamper',
      lightning: server,
      tokenSecret: SECRET,
    }),
  )
  app.get('/tamper', (c) => c.json({ ok: true }))

  const tamperer = (async (url: string, init?: RequestInit) => {
    const res = await app.request(url, init)
    const receipt = res.headers.get('x-payment-receipt')
    if (!receipt) return res
    const parts = receipt.split('.')
    if (parts.length !== 3) return res
    const sig = parts[2] ?? ''
    parts[2] = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    const headers = new Headers(res.headers)
    headers.set('x-payment-receipt', parts.join('.'))
    return new Response(res.body, { status: res.status, headers })
  }) as typeof fetch

  await expect(
    fetchWithL402('http://x/tamper', {
      wallet,
      max_price_msat: 5000n,
      fetch: tamperer,
    }),
  ).rejects.toThrow(/receipt/)
})

test('SPEC §6 overcharging: client enforces max_price_msat cap', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const server = new MemoryNode({ ledger, name: 'server' })
  const wallet = new MemoryNode({ ledger, name: 'client' })

  const app = new Hono()
  app.use(
    '/r',
    paywall({
      serverDid: did,
      serverPrivateKey: kp.privateKey,
      price_msat: 10_000n,
      resource: '/r',
      lightning: server,
      tokenSecret: SECRET,
    }),
  )
  app.get('/r', (c) => c.json({ ok: true }))

  await expect(
    fetchWithL402('http://x/r', {
      wallet,
      max_price_msat: 5000n,
      fetch: ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch,
    }),
  ).rejects.toThrow(/price-cap|cap|exceeds/)
})

test('SPEC §6 DID-revocation boundary: client rejects envelope past expires_at', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const server = new MemoryNode({ ledger, name: 'server' })
  const wallet = new MemoryNode({ ledger, name: 'client' })

  const app = new Hono()
  app.use(
    '/r',
    paywall({
      serverDid: did,
      serverPrivateKey: kp.privateKey,
      price_msat: 1000n,
      resource: '/r',
      lightning: server,
      tokenSecret: SECRET,
      invoiceTtlSeconds: 1,
    }),
  )
  app.get('/r', (c) => c.json({ ok: true }))

  await expect(
    fetchWithL402('http://x/r', {
      wallet,
      max_price_msat: 5000n,
      now: () => new Date(Date.now() + 10_000),
      fetch: ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch,
    }),
  ).rejects.toThrow(/expired/)
})
