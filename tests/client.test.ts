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

test('fetchWithL402 rejects when BOLT11 amount mismatches envelope price', async () => {
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
