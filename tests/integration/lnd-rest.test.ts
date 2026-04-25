import { test, expect } from 'bun:test'
import { LndRestNode } from '../../src/lnd-rest.ts'

const RUN = process.env.AGENT_PAY_INTEGRATION === '1'

test.if(RUN)('LndRestNode createInvoice + lookupInvoice against polar alice', async () => {
  const node = new LndRestNode({
    url: process.env.LND_ALICE_URL ?? 'https://localhost:8081',
    macaroonHex: process.env.LND_ALICE_MACAROON_HEX ?? '',
  })
  const inv = await node.createInvoice({ amount_msat: 1000n })
  expect(inv.bolt11.startsWith('lnbcrt')).toBe(true)
  const lookup = await node.lookupInvoice(inv.payment_hash)
  expect(lookup.settled).toBe(false)
})

test.if(RUN)('LndRestNode pays invoice from bob and alice sees it settled', async () => {
  const alice = new LndRestNode({
    url: process.env.LND_ALICE_URL ?? 'https://localhost:8081',
    macaroonHex: process.env.LND_ALICE_MACAROON_HEX ?? '',
  })
  const bob = new LndRestNode({
    url: process.env.LND_BOB_URL ?? 'https://localhost:8082',
    macaroonHex: process.env.LND_BOB_MACAROON_HEX ?? '',
  })
  const inv = await alice.createInvoice({ amount_msat: 1000n })
  const pay = await bob.payInvoice(inv.bolt11)
  expect(pay.preimage.length).toBe(32)
  const lookup = await alice.lookupInvoice(inv.payment_hash)
  expect(lookup.settled).toBe(true)
})
