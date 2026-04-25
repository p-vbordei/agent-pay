import { test, expect } from 'bun:test'
import { ReplayCache } from '../src/replay.ts'

test('ReplayCache marks and detects', () => {
  const cache = new ReplayCache({ maxEntries: 100 })
  expect(cache.isUsed('hash1')).toBe(false)
  cache.markUsed('hash1', Date.now() + 60_000)
  expect(cache.isUsed('hash1')).toBe(true)
})

test('ReplayCache evicts expired entries on access', () => {
  const now = { value: 1000 }
  const cache = new ReplayCache({ maxEntries: 100, now: () => now.value })
  cache.markUsed('h', 2000)
  expect(cache.isUsed('h')).toBe(true)
  now.value = 3000
  expect(cache.isUsed('h')).toBe(false)
})

test('ReplayCache evicts oldest when over maxEntries', () => {
  const cache = new ReplayCache({ maxEntries: 2 })
  cache.markUsed('a', Date.now() + 60_000)
  cache.markUsed('b', Date.now() + 60_000)
  cache.markUsed('c', Date.now() + 60_000)
  expect(cache.isUsed('a')).toBe(false)
  expect(cache.isUsed('b')).toBe(true)
  expect(cache.isUsed('c')).toBe(true)
})
