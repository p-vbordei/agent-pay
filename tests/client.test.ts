import { test, expect } from 'bun:test'
import { Hono } from 'hono'
import { generateKeyPair, didKeyFromPublicKey } from '../src/keys.ts'
import { MemoryLedger, MemoryNode } from '../src/memory-node.ts'
import { paywall } from '../src/server.ts'
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
