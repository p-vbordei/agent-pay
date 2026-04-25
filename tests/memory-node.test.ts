import { test, expect } from 'bun:test'
import { MemoryNode, MemoryLedger } from '../src/memory-node.ts'

test('two MemoryNodes share a ledger and route a payment', async () => {
  const ledger = new MemoryLedger()
  const alice = new MemoryNode({ ledger, name: 'alice' })
  const bob = new MemoryNode({ ledger, name: 'bob' })

  const inv = await alice.createInvoice({ amount_msat: 1000n, memo: 'tea' })
  expect(inv.bolt11.startsWith('lnbcrt')).toBe(true)
  expect(inv.payment_hash).toMatch(/^[0-9a-f]{64}$/)

  const before = await alice.lookupInvoice(inv.payment_hash)
  expect(before.settled).toBe(false)

  const pay = await bob.payInvoice(inv.bolt11)
  expect(pay.preimage.length).toBe(32)

  const after = await alice.lookupInvoice(inv.payment_hash)
  expect(after.settled).toBe(true)
  expect(after.preimage).toEqual(pay.preimage)
})

test('payInvoice rejects unknown bolt11', async () => {
  const ledger = new MemoryLedger()
  const node = new MemoryNode({ ledger, name: 'solo' })
  await expect(node.payInvoice('lnbcrt0unknown')).rejects.toThrow()
})
