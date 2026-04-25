import { parseInvoice } from './bolt11.ts'
import { verifyInvoiceEnvelope, verifyReceipt } from './envelope.ts'
import { publicKeyFromDidKey } from './keys.ts'
import type { LightningNode } from './lightning.ts'

export type FetchWithL402Options = RequestInit & {
  wallet: LightningNode
  max_price_msat: bigint
  expectedDid?: string
  verifyReceipt?: boolean
  fetch?: typeof fetch
  now?: () => Date
}

export class FetchWithL402Error extends Error {
  reason: string
  constructor(message: string, reason: string) {
    super(message)
    this.reason = reason
    this.name = 'FetchWithL402Error'
  }
}

const CHALLENGE_RE = /macaroon="([^"]+)",\s*invoice="([^"]+)"/

export async function fetchWithL402(
  url: string,
  opts: FetchWithL402Options,
): Promise<Response> {
  const f = opts.fetch ?? fetch
  const verifyReceiptFlag = opts.verifyReceipt ?? true
  const now = opts.now ?? (() => new Date())

  const baseInit = stripOpts(opts)
  const first = await f(url, { ...baseInit, method: opts.method ?? 'GET' })
  if (first.status !== 402) return first

  const wwwAuth = first.headers.get('www-authenticate') ?? ''
  const challengeMatch = wwwAuth.match(CHALLENGE_RE)
  if (!challengeMatch) throw new FetchWithL402Error('no L402 challenge', 'missing-challenge')
  const [, token, bolt11] = challengeMatch as [string, string, string]

  const envelopeJws = first.headers.get('x-did-invoice')
  if (!envelopeJws) throw new FetchWithL402Error('missing X-Did-Invoice', 'missing-x-did-invoice')

  const resolver = makeDidKeyResolver(opts.expectedDid)
  let env
  try {
    env = await verifyInvoiceEnvelope(envelopeJws, { bolt11, resolver })
  } catch (e) {
    throw new FetchWithL402Error(
      `X-Did-Invoice verification failed: ${(e as Error).message}`,
      'jws-invalid',
    )
  }

  if (BigInt(env.price_msat) > opts.max_price_msat) {
    throw new FetchWithL402Error(
      `price ${env.price_msat} exceeds cap ${opts.max_price_msat}`,
      'price-cap',
    )
  }
  if (Date.parse(env.expires_at) <= now().getTime()) {
    throw new FetchWithL402Error(`invoice expired (${env.expires_at})`, 'expired')
  }

  const parsed = parseInvoice(bolt11)
  if (parsed.amount_msat !== BigInt(env.price_msat)) {
    throw new FetchWithL402Error(
      `BOLT11 amount ${parsed.amount_msat} mismatches envelope price ${env.price_msat}`,
      'amount-mismatch',
    )
  }

  const pay = await opts.wallet.payInvoice(bolt11)
  const preimageHex = Array.from(pay.preimage, (b) => b.toString(16).padStart(2, '0')).join('')

  const second = await f(url, {
    ...baseInit,
    method: opts.method ?? 'GET',
    headers: { ...(opts.headers ?? {}), authorization: `L402 ${token}:${preimageHex}` },
  })
  if (second.status !== 200) return second

  if (verifyReceiptFlag) {
    const receipt = second.headers.get('x-payment-receipt')
    if (receipt) {
      try {
        await verifyReceipt(receipt, { bolt11, resolver })
      } catch (e) {
        throw new FetchWithL402Error(
          `receipt verification failed: ${(e as Error).message}`,
          'receipt-invalid',
        )
      }
    }
  }
  return second
}

function makeDidKeyResolver(pinned?: string) {
  return async (kid: string): Promise<Uint8Array> => {
    const did = kid.split('#')[0] ?? kid
    if (pinned && did !== pinned) throw new Error(`unexpected DID ${did}`)
    return publicKeyFromDidKey(did)
  }
}

function stripOpts(opts: FetchWithL402Options): RequestInit {
  const {
    wallet: _w,
    max_price_msat: _p,
    expectedDid: _d,
    verifyReceipt: _v,
    fetch: _f,
    now: _n,
    ...rest
  } = opts
  return rest
}
