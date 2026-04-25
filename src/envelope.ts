import { sha256 } from '@noble/hashes/sha256'
import { signCompact, verifyCompact, type ResolveKey } from './jws.ts'
import { verificationMethodId } from './keys.ts'

const VERSION = 'agent-pay/0.1'

export type InvoiceEnvelope = {
  v: string
  invoice_hash: string
  did: string
  price_msat: string
  resource: string
  expires_at: string
  nonce: string
}

export type ReceiptEnvelope = {
  v: string
  invoice_hash: string
  preimage_hash: string
  resource: string
  paid_at: string
  did: string
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function invoiceHashHex(bolt11: string): string {
  return hex(sha256(new TextEncoder().encode(bolt11)))
}

export type SignInvoiceOpts = {
  bolt11: string
  did: string
  privateKey: Uint8Array
  price_msat: bigint
  resource: string
  expires_at: string
  nonce: Uint8Array
}

export async function signInvoiceEnvelope(opts: SignInvoiceOpts): Promise<string> {
  const payload: InvoiceEnvelope = {
    v: VERSION,
    invoice_hash: invoiceHashHex(opts.bolt11),
    did: opts.did,
    price_msat: opts.price_msat.toString(),
    resource: opts.resource,
    expires_at: opts.expires_at,
    nonce: b64(opts.nonce),
  }
  return signCompact(payload, opts.privateKey, verificationMethodId(opts.did))
}

export type VerifyInvoiceOpts = {
  bolt11: string
  resolver: ResolveKey
}

export async function verifyInvoiceEnvelope(
  token: string,
  opts: VerifyInvoiceOpts,
): Promise<InvoiceEnvelope> {
  const { payload } = await verifyCompact<InvoiceEnvelope>(token, opts.resolver)
  if (payload.v !== VERSION) throw new Error(`unsupported envelope version: ${payload.v}`)
  const expected = invoiceHashHex(opts.bolt11)
  if (payload.invoice_hash !== expected) {
    throw new Error(
      `invoice_hash mismatch: envelope=${payload.invoice_hash} bolt11=${expected}`,
    )
  }
  return payload
}

export type SignReceiptOpts = {
  bolt11: string
  did: string
  privateKey: Uint8Array
  preimage: Uint8Array
  resource: string
  paid_at: string
}

export async function signReceipt(opts: SignReceiptOpts): Promise<string> {
  const payload: ReceiptEnvelope = {
    v: VERSION,
    invoice_hash: invoiceHashHex(opts.bolt11),
    preimage_hash: hex(sha256(opts.preimage)),
    resource: opts.resource,
    paid_at: opts.paid_at,
    did: opts.did,
  }
  return signCompact(payload, opts.privateKey, verificationMethodId(opts.did))
}

export type VerifyReceiptOpts = {
  bolt11: string
  resolver: ResolveKey
}

export async function verifyReceipt(
  token: string,
  opts: VerifyReceiptOpts,
): Promise<ReceiptEnvelope> {
  const { payload } = await verifyCompact<ReceiptEnvelope>(token, opts.resolver)
  if (payload.v !== VERSION) throw new Error(`unsupported receipt version: ${payload.v}`)
  if (payload.invoice_hash !== invoiceHashHex(opts.bolt11)) {
    throw new Error('receipt invoice_hash mismatch')
  }
  return payload
}
