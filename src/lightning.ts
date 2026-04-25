export type InvoiceCreateRequest = {
  amount_msat: bigint
  memo?: string
  expiry_seconds?: number
}

export type Invoice = {
  bolt11: string
  payment_hash: string
}

export type InvoiceLookup = {
  settled: boolean
  amount_msat: bigint
  preimage?: Uint8Array
}

export type PaymentResult = {
  preimage: Uint8Array
  fee_msat: bigint
}

export interface LightningNode {
  createInvoice(req: InvoiceCreateRequest): Promise<Invoice>
  lookupInvoice(payment_hash: string): Promise<InvoiceLookup>
  payInvoice(bolt11: string): Promise<PaymentResult>
}
