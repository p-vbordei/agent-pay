import { test, expect } from 'bun:test'
import { generateKeyPair, didKeyFromPublicKey, publicKeyFromDidKey } from '../src/keys.ts'
import {
  signInvoiceEnvelope,
  verifyInvoiceEnvelope,
  signReceipt,
  verifyReceipt,
} from '../src/envelope.ts'

const FAKE_BOLT11 = 'lnbc10n1pdummy'

async function setup() {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const resolver = async (kid: string) => {
    if (!kid.startsWith(did)) throw new Error(`unknown kid ${kid}`)
    return publicKeyFromDidKey(did)
  }
  return { kp, did, resolver }
}

test('signInvoiceEnvelope/verifyInvoiceEnvelope roundtrip', async () => {
  const { kp, did, resolver } = await setup()
  const token = await signInvoiceEnvelope({
    bolt11: FAKE_BOLT11,
    did,
    privateKey: kp.privateKey,
    price_msat: 1000n,
    resource: '/report',
    expires_at: '2030-01-01T00:00:00Z',
    nonce: new Uint8Array(16),
  })
  const env = await verifyInvoiceEnvelope(token, { bolt11: FAKE_BOLT11, resolver })
  expect(env.did).toBe(did)
  expect(env.price_msat).toBe('1000')
  expect(env.resource).toBe('/report')
})

test('verifyInvoiceEnvelope rejects when invoice_hash does not match bolt11', async () => {
  const { kp, did, resolver } = await setup()
  const token = await signInvoiceEnvelope({
    bolt11: FAKE_BOLT11,
    did,
    privateKey: kp.privateKey,
    price_msat: 1000n,
    resource: '/report',
    expires_at: '2030-01-01T00:00:00Z',
    nonce: new Uint8Array(16),
  })
  await expect(
    verifyInvoiceEnvelope(token, { bolt11: 'lnbc1pdifferent', resolver }),
  ).rejects.toThrow(/invoice_hash/i)
})

test('signReceipt/verifyReceipt roundtrip', async () => {
  const { kp, did, resolver } = await setup()
  const token = await signReceipt({
    bolt11: FAKE_BOLT11,
    did,
    privateKey: kp.privateKey,
    preimage: new Uint8Array(32),
    resource: '/report',
    paid_at: '2030-01-01T00:00:00Z',
  })
  const env = await verifyReceipt(token, { bolt11: FAKE_BOLT11, resolver })
  expect(env.did).toBe(did)
  expect(env.resource).toBe('/report')
})
