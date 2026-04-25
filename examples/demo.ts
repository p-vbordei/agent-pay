// agent-pay v0.1 demo — runs in one terminal, no docker.
// Spins a Hono server with a did:key identity that paywalls /report,
// then a tiny client pays via an in-memory Lightning fake.
import { randomBytes } from '@noble/hashes/utils'
import { Hono } from 'hono'
import { fetchWithL402 } from '../src/client.ts'
import {
  didKeyFromPublicKey,
  generateKeyPair,
  MemoryLedger,
  MemoryNode,
} from '../src/index.ts'
import { paywall } from '../src/server.ts'

const kp = await generateKeyPair()
const did = didKeyFromPublicKey(kp.publicKey)
const ledger = new MemoryLedger()
const serverNode = new MemoryNode({ ledger, name: 'server' })
const clientNode = new MemoryNode({ ledger, name: 'client' })

const app = new Hono()
app.use(
  '/report',
  paywall({
    serverDid: did,
    serverPrivateKey: kp.privateKey,
    price_msat: 1000n,
    resource: '/report',
    lightning: serverNode,
    tokenSecret: randomBytes(32),
  }),
)
app.get('/report', (c) => c.json({ insight: 'agents charging agents works.' }))

const port = 4242
const srv = Bun.serve({ port, fetch: app.fetch })
console.log(`server: ${did}`)
console.log(`listening on http://localhost:${port}`)

const res = await fetchWithL402(`http://localhost:${port}/report`, {
  wallet: clientNode,
  max_price_msat: 5000n,
  expectedDid: did,
})
console.log('payload:', await res.json())
console.log('receipt:', `${res.headers.get('x-payment-receipt')?.slice(0, 64)}…`)
srv.stop()
