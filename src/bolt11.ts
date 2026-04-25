import bolt11 from 'bolt11'

export type ParsedInvoice = {
  payment_hash: string
  amount_msat: bigint
  expiry_at?: Date
  raw: ReturnType<typeof bolt11.decode>
}

export function parseInvoice(input: string): ParsedInvoice {
  const decoded = bolt11.decode(input)
  const phTag = decoded.tags.find((t) => t.tagName === 'payment_hash')
  if (!phTag || typeof phTag.data !== 'string') throw new Error('bolt11: missing payment_hash')
  const amount_msat = decoded.millisatoshis ? BigInt(decoded.millisatoshis) : 0n
  const expiryTag = decoded.tags.find((t) => t.tagName === 'expire_time')
  const expiry_at =
    expiryTag && typeof expiryTag.data === 'number' && decoded.timestamp
      ? new Date((decoded.timestamp + expiryTag.data) * 1000)
      : undefined
  return {
    payment_hash: phTag.data,
    amount_msat,
    ...(expiry_at ? { expiry_at } : {}),
    raw: decoded,
  }
}
