import { test, expect } from 'bun:test'
import bolt11 from 'bolt11'
import { parseInvoice } from '../src/bolt11.ts'

const REGTEST = {
  bech32: 'bcrt',
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  validWitnessVersions: [0, 1],
}
const SIGNING_KEY_HEX = 'e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734'

function makeInvoice(amount_msat: bigint, payment_hash: string): string {
  const obj = bolt11.encode({
    network: REGTEST,
    millisatoshis: amount_msat.toString(),
    timestamp: Math.floor(Date.now() / 1000),
    tags: [
      { tagName: 'payment_hash', data: payment_hash },
      { tagName: 'description', data: 'test' },
      { tagName: 'expire_time', data: 300 },
    ],
  })
  return bolt11.sign(obj, SIGNING_KEY_HEX).paymentRequest as string
}

test('parseInvoice extracts amount_msat and payment_hash', () => {
  const ph = 'b'.repeat(64)
  const invoice = makeInvoice(10_000n, ph)
  const parsed = parseInvoice(invoice)
  expect(parsed.amount_msat).toBe(10_000n)
  expect(parsed.payment_hash).toBe(ph)
})

test('parseInvoice returns 0n amount when invoice has no amount', () => {
  const obj = bolt11.encode({
    network: REGTEST,
    timestamp: Math.floor(Date.now() / 1000),
    tags: [
      { tagName: 'payment_hash', data: 'c'.repeat(64) },
      { tagName: 'description', data: 'no-amount' },
    ],
  })
  const invoice = bolt11.sign(obj, SIGNING_KEY_HEX).paymentRequest as string
  const parsed = parseInvoice(invoice)
  expect(parsed.amount_msat).toBe(0n)
})

test('parseInvoice throws on non-bolt11 input', () => {
  expect(() => parseInvoice('not a bolt11')).toThrow()
})
