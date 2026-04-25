import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/hashes/utils'
import bolt11 from 'bolt11'
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

const REGTEST = {
  bech32: 'bcrt',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  validWitnessVersions: [0, 1],
}
const SIGNING_KEY_HEX = 'e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734'

export class MemoryLedger {
  invoices = new Map<string, Entry>()
}

export class MemoryNode implements LightningNode {
  private ledger: MemoryLedger
  private name: string
  constructor(opts: { ledger: MemoryLedger; name: string }) {
    this.ledger = opts.ledger
    this.name = opts.name
  }

  async createInvoice(req: InvoiceCreateRequest): Promise<Invoice> {
    const preimage = randomBytes(32)
    const payment_hash = hex(sha256(preimage))
    const encoded = bolt11.encode({
      network: REGTEST,
      millisatoshis: req.amount_msat.toString(),
      timestamp: Math.floor(Date.now() / 1000),
      tags: [
        { tagName: 'payment_hash', data: payment_hash },
        { tagName: 'description', data: req.memo ?? '' },
        { tagName: 'expire_time', data: req.expiry_seconds ?? 300 },
      ],
    })
    const signed = bolt11.sign(encoded, SIGNING_KEY_HEX)
    const paymentRequest = signed.paymentRequest as string
    this.ledger.invoices.set(payment_hash, {
      amount_msat: req.amount_msat,
      payment_hash,
      preimage,
      bolt11: paymentRequest,
      settled: false,
      payee: this.name,
    })
    return { bolt11: paymentRequest, payment_hash }
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
