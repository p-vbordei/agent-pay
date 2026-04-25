import { randomBytes } from '@noble/hashes/utils'
import type { Context, MiddlewareHandler } from 'hono'
import { signInvoiceEnvelope, signReceipt } from './envelope.ts'
import type { LightningNode } from './lightning.ts'
import { ReplayCache } from './replay.ts'
import { issueToken, verifyToken } from './token.ts'

export type PaywallOptions = {
  serverDid: string
  serverPrivateKey: Uint8Array
  price_msat: bigint
  resource: string
  lightning: LightningNode
  tokenSecret: Uint8Array
  invoiceTtlSeconds?: number
  now?: () => Date
  replay?: ReplayCache
}

const AUTH_RE = /^L402\s+([^:\s]+):([0-9a-fA-F]+)$/

function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new Error('hex length odd')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return d === 0
}

export function paywall(opts: PaywallOptions): MiddlewareHandler {
  const ttl = opts.invoiceTtlSeconds ?? 300
  const now = opts.now ?? (() => new Date())
  const replay = opts.replay ?? new ReplayCache()
  const issued = new Map<string, string>() // payment_hash → bolt11

  return async (c, next) => {
    const auth = c.req.header('authorization')
    if (!auth) return challenge(c, opts, ttl, now(), issued)
    const m = auth.match(AUTH_RE)
    if (!m) return challenge(c, opts, ttl, now(), issued)
    const [, token, preimageHex] = m as [string, string, string]

    let payload
    try {
      payload = await verifyToken(token, opts.tokenSecret)
    } catch {
      return challenge(c, opts, ttl, now(), issued)
    }

    if (replay.isUsed(payload.payment_hash)) {
      return c.json({ error: 'preimage replayed' }, 401)
    }

    const lookup = await opts.lightning.lookupInvoice(payload.payment_hash)
    if (!lookup.settled || !lookup.preimage) {
      return c.json({ error: 'invoice not settled' }, 401)
    }
    const presented = fromHex(preimageHex)
    if (!equalBytes(presented, lookup.preimage)) {
      return c.json({ error: 'preimage does not match settled invoice' }, 401)
    }

    replay.markUsed(payload.payment_hash, Date.parse(payload.expires_at))

    await next()

    const bolt11 = issued.get(payload.payment_hash)
    if (bolt11) {
      const receipt = await signReceipt({
        bolt11,
        did: opts.serverDid,
        privateKey: opts.serverPrivateKey,
        preimage: presented,
        resource: opts.resource,
        paid_at: now().toISOString(),
      })
      c.header('x-payment-receipt', receipt)
    }
  }
}

async function challenge(
  c: Context,
  opts: PaywallOptions,
  ttlSeconds: number,
  now: Date,
  issued: Map<string, string>,
): Promise<Response> {
  const invoice = await opts.lightning.createInvoice({
    amount_msat: opts.price_msat,
    expiry_seconds: ttlSeconds,
  })
  issued.set(invoice.payment_hash, invoice.bolt11)
  const expires_at = new Date(now.getTime() + ttlSeconds * 1000).toISOString()
  const nonce = randomBytes(16)
  const envelope = await signInvoiceEnvelope({
    bolt11: invoice.bolt11,
    did: opts.serverDid,
    privateKey: opts.serverPrivateKey,
    price_msat: opts.price_msat,
    resource: opts.resource,
    expires_at,
    nonce,
  })
  const token = await issueToken({
    payment_hash: invoice.payment_hash,
    expires_at,
    secret: opts.tokenSecret,
  })
  c.header('www-authenticate', `L402 macaroon="${token}", invoice="${invoice.bolt11}"`)
  c.header('x-did-invoice', envelope)
  return c.body(null, 402)
}
