import type {
  Invoice,
  InvoiceCreateRequest,
  InvoiceLookup,
  LightningNode,
  PaymentResult,
} from './lightning.ts'

export type LndRestConfig = {
  url: string
  macaroonHex: string
  fetch?: typeof fetch
}

function b64FromHex(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return Buffer.from(bytes).toString('base64')
}
function hexFromB64(b64: string): string {
  return Array.from(Buffer.from(b64, 'base64'), (b) => b.toString(16).padStart(2, '0')).join('')
}

export class LndRestNode implements LightningNode {
  private cfg: LndRestConfig
  constructor(cfg: LndRestConfig) {
    this.cfg = cfg
  }

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    const f = this.cfg.fetch ?? fetch
    const headers = {
      'grpc-metadata-macaroon': this.cfg.macaroonHex,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    }
    return f(`${this.cfg.url}${path}`, { ...init, headers })
  }

  async createInvoice(r: InvoiceCreateRequest): Promise<Invoice> {
    const res = await this.req('/v1/invoices', {
      method: 'POST',
      body: JSON.stringify({
        value_msat: r.amount_msat.toString(),
        memo: r.memo ?? '',
        expiry: (r.expiry_seconds ?? 300).toString(),
      }),
    })
    if (!res.ok) throw new Error(`LND createInvoice ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as { payment_request: string; r_hash: string }
    return { bolt11: body.payment_request, payment_hash: hexFromB64(body.r_hash) }
  }

  async lookupInvoice(payment_hash: string): Promise<InvoiceLookup> {
    const b64 = b64FromHex(payment_hash)
    const res = await this.req(`/v1/invoice/${encodeURIComponent(b64)}`)
    if (!res.ok) throw new Error(`LND lookupInvoice ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as {
      settled: boolean
      value_msat?: string
      r_preimage?: string
    }
    return {
      settled: !!body.settled,
      amount_msat: BigInt(body.value_msat ?? '0'),
      ...(body.r_preimage
        ? { preimage: new Uint8Array(Buffer.from(body.r_preimage, 'base64')) }
        : {}),
    }
  }

  async payInvoice(bolt11: string): Promise<PaymentResult> {
    const res = await this.req('/v1/channels/transactions', {
      method: 'POST',
      body: JSON.stringify({ payment_request: bolt11 }),
    })
    if (!res.ok) throw new Error(`LND payInvoice ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as {
      payment_error?: string
      payment_preimage: string
      payment_route?: { total_fees_msat?: string }
    }
    if (body.payment_error) throw new Error(`LND payment_error: ${body.payment_error}`)
    return {
      preimage: new Uint8Array(Buffer.from(body.payment_preimage, 'base64')),
      fee_msat: BigInt(body.payment_route?.total_fees_msat ?? '0'),
    }
  }
}
