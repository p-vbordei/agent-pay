import { test, expect } from 'bun:test'
import { Hono } from 'hono'
import { generateKeyPair, didKeyFromPublicKey, MemoryLedger, MemoryNode } from '../src/index.ts'
import { paywall } from '../src/server.ts'
import { fetchWithL402 } from '../src/client.ts'

const SECRET = new TextEncoder().encode('thirty-two-byte-test-secret-pad!')

test('e2e: server middleware + fetchWithL402 roundtrip via Hono app.request', async () => {
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
      price_msat: 1234n,
      resource: '/report',
      lightning: server,
      tokenSecret: SECRET,
    }),
  )
  app.get('/report', (c) => c.json({ ok: true, body: 'paid content' }))

  const res = await fetchWithL402('http://x/report', {
    wallet: client,
    max_price_msat: 5000n,
    expectedDid: did,
    fetch: ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch,
  })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toEqual({ ok: true, body: 'paid content' })
})
