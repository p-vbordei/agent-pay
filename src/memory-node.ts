import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/hashes/utils'
import type {
  Invoice,
  InvoiceCreateRequest,
  InvoiceLookup,
  LightningNode,
  PaymentResult,
} from './lightning.ts'

type Entry = {
  amount_msat: bigint
  payment_hash: string
  preimage: Uint8Array
  bolt11: string
  settled: boolean
  payee: string
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class MemoryLedger {
  invoices = new Map<string, Entry>()
}

export class MemoryNode implements LightningNode {
  private ledger: MemoryLedger
  private name: string
  private counter = 0
  constructor(opts: { ledger: MemoryLedger; name: string }) {
    this.ledger = opts.ledger
    this.name = opts.name
  }

  async createInvoice(req: InvoiceCreateRequest): Promise<Invoice> {
    const preimage = randomBytes(32)
    const payment_hash = hex(sha256(preimage))
    const id = `${this.name}-${++this.counter}`
    const bolt11 = `lnbcrt${req.amount_msat}n1${payment_hash.slice(0, 16)}${id}`
    this.ledger.invoices.set(payment_hash, {
      amount_msat: req.amount_msat,
      payment_hash,
      preimage,
      bolt11,
      settled: false,
      payee: this.name,
    })
    return { bolt11, payment_hash }
  }

  async lookupInvoice(payment_hash: string): Promise<InvoiceLookup> {
    const entry = this.ledger.invoices.get(payment_hash)
    if (!entry) throw new Error(`unknown payment_hash: ${payment_hash}`)
    return {
      settled: entry.settled,
      amount_msat: entry.amount_msat,
      ...(entry.settled ? { preimage: entry.preimage } : {}),
    }
  }

  async payInvoice(bolt11: string): Promise<PaymentResult> {
    for (const entry of this.ledger.invoices.values()) {
      if (entry.bolt11 === bolt11) {
        if (entry.settled) throw new Error('invoice already settled')
        entry.settled = true
        return { preimage: entry.preimage, fee_msat: 0n }
      }
    }
    throw new Error(`unknown bolt11: ${bolt11.slice(0, 32)}…`)
  }
}
