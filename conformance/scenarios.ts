import { Hono } from 'hono'
import { fetchWithL402, FetchWithL402Error } from '../src/client.ts'
import { signInvoiceEnvelope } from '../src/envelope.ts'
import { generateKeyPair, didKeyFromPublicKey } from '../src/keys.ts'
import { MemoryLedger, MemoryNode } from '../src/memory-node.ts'
import { paywall } from '../src/server.ts'
import { issueToken } from '../src/token.ts'

const SECRET = new TextEncoder().encode('thirty-two-byte-test-secret-pad!')

async function baseSetup(opts: { price_msat?: bigint } = {}) {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const ledger = new MemoryLedger()
  const server = new MemoryNode({ ledger, name: 'server' })
  const wallet = new MemoryNode({ ledger, name: 'wallet' })
  const app = new Hono()
  app.use(
    '/r',
    paywall({
      serverDid: did,
      serverPrivateKey: kp.privateKey,
      price_msat: opts.price_msat ?? 1000n,
      resource: '/r',
      lightning: server,
      tokenSecret: SECRET,
    }),
  )
  app.get('/r', (c) => c.json({ ok: true }))
  return { kp, did, ledger, server, wallet, app }
}

export async function runVector(v: { scenario: string; [k: string]: unknown }): Promise<void> {
  switch (v.scenario) {
    case 'C1-missing-x-did-invoice': {
      const { app, wallet } = await baseSetup()
      const stripper = (async (url: string, init?: RequestInit) => {
        const res = await app.request(url, init)
        const headers = new Headers(res.headers)
        headers.delete('x-did-invoice')
        return new Response(res.body, { status: res.status, headers })
      }) as typeof fetch
      try {
        await fetchWithL402('http://x/r', { wallet, max_price_msat: 5000n, fetch: stripper })
      } catch (e) {
        if (e instanceof FetchWithL402Error && e.reason === 'missing-x-did-invoice') return
        throw e
      }
      throw new Error('expected fetchWithL402 to reject with missing-x-did-invoice')
    }

    case 'C1-invalid-jws': {
      const { app, wallet } = await baseSetup()
      const tamperer = (async (url: string, init?: RequestInit) => {
        const res = await app.request(url, init)
        const jws = res.headers.get('x-did-invoice')
        if (!jws) return res
        const parts = jws.split('.')
        if (parts.length === 3) {
          const sig = parts[2] ?? ''
          // Flip the first signature char — guaranteed to land in significant bits
          // (b64url's last char only encodes 4 bits, which fall outside the 64-byte sig).
          parts[2] = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
        }
        const headers = new Headers(res.headers)
        headers.set('x-did-invoice', parts.join('.'))
        return new Response(res.body, { status: res.status, headers })
      }) as typeof fetch
      try {
        await fetchWithL402('http://x/r', { wallet, max_price_msat: 5000n, fetch: tamperer })
      } catch (e) {
        if (e instanceof FetchWithL402Error && e.reason === 'jws-invalid') return
        throw e
      }
      throw new Error('expected fetchWithL402 to reject with jws-invalid')
    }

    case 'C2-roundtrip': {
      const { app, did, wallet } = await baseSetup()
      const res = await fetchWithL402('http://x/r', {
        wallet,
        max_price_msat: 5000n,
        expectedDid: did,
        fetch: ((u: string, i?: RequestInit) => app.request(u, i)) as typeof fetch,
      })
      if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`)
      if (!res.headers.get('x-payment-receipt')) throw new Error('missing x-payment-receipt')
      return
    }

    case 'C3-replayed-preimage': {
      const { app, wallet } = await baseSetup()
      let captured: string | undefined
      const recorder = ((url: string, init?: RequestInit) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization
        if (typeof auth === 'string' && auth.startsWith('L402 ')) captured = auth
        return app.request(url, init)
      }) as typeof fetch
      const ok = await fetchWithL402('http://x/r', {
        wallet,
        max_price_msat: 5000n,
        fetch: recorder,
      })
      if (ok.status !== 200) throw new Error('first request should succeed')
      if (!captured) throw new Error('did not capture Authorization')
      const replay = await app.request('/r', { headers: { authorization: captured } })
      if (replay.status !== 401) throw new Error(`expected 401 on replay, got ${replay.status}`)
      return
    }

    case 'C4-bolt11-hash-mismatch': {
      const kp = await generateKeyPair()
      const did = didKeyFromPublicKey(kp.publicKey)
      const ledger = new MemoryLedger()
      const node = new MemoryNode({ ledger, name: 'liar' })
      const wallet = new MemoryNode({ ledger, name: 'wallet' })
      const app = new Hono()
      app.get('/r', async (c) => {
        const real = await node.createInvoice({ amount_msat: 1000n })
        const fake = await node.createInvoice({ amount_msat: 1000n })
        const env = await signInvoiceEnvelope({
          bolt11: fake.bolt11,
          did,
          privateKey: kp.privateKey,
          price_msat: 1000n,
          resource: '/r',
          expires_at: '2030-01-01T00:00:00Z',
          nonce: new Uint8Array(16),
        })
        const tok = await issueToken({
          payment_hash: real.payment_hash,
          expires_at: '2030-01-01T00:00:00Z',
          secret: SECRET,
        })
        c.header('www-authenticate', `L402 macaroon="${tok}", invoice="${real.bolt11}"`)
        c.header('x-did-invoice', env)
        return c.body(null, 402)
      })
      try {
        await fetchWithL402('http://x/r', {
          wallet,
          max_price_msat: 5000n,
          fetch: ((u: string, i?: RequestInit) => app.request(u, i)) as typeof fetch,
        })
      } catch (e) {
        if (e instanceof FetchWithL402Error && e.reason === 'jws-invalid') return
        throw e
      }
      throw new Error('expected fetchWithL402 to reject with jws-invalid')
    }

    default:
      throw new Error(`unknown scenario: ${v.scenario}`)
  }
}
