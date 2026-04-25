import { test, expect } from 'bun:test'
import { Hono } from 'hono'
import { generateKeyPair, didKeyFromPublicKey } from '../src/keys.ts'
import { MemoryLedger, MemoryNode } from '../src/memory-node.ts'
import { paywall } from '../src/server.ts'

const SECRET = new TextEncoder().encode('thirty-two-byte-test-secret-pad!')

async function setup() {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const lightning = new MemoryNode({ ledger, name: 'server' })
  const app = new Hono()
  app.use(
    '/report',
    paywall({
      serverDid: did,
      serverPrivateKey: kp.privateKey,
      price_msat: 1000n,
      resource: '/report',
      lightning,
      tokenSecret: SECRET,
    }),
  )
  app.get('/report', (c) => c.json({ data: 'hello' }))
  return { app, did, ledger, lightning }
}

test('first request returns 402 with X-Did-Invoice and L402 challenge', async () => {
  const { app } = await setup()
  const res = await app.request('/report')
  expect(res.status).toBe(402)
  const wwwAuth = res.headers.get('www-authenticate')
  expect(wwwAuth).toMatch(/^L402 /)
  expect(wwwAuth).toMatch(/macaroon="/)
  expect(wwwAuth).toMatch(/invoice="/)
  expect(res.headers.get('x-did-invoice')).toBeTruthy()
})
