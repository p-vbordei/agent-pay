import { test, expect } from 'bun:test'
import { canonicalJSON, jcsHash } from '../src/jcs.ts'

test('canonicalJSON sorts keys lexicographically', () => {
  const a = canonicalJSON({ b: 1, a: 2 })
  const b = canonicalJSON({ a: 2, b: 1 })
  expect(new TextDecoder().decode(a)).toBe('{"a":2,"b":1}')
  expect(a).toEqual(b)
})

test('jcsHash returns 32-byte SHA-256 of canonical bytes', () => {
  const h = jcsHash({ x: 1 })
  expect(h.length).toBe(32)
})

test('canonicalJSON throws when canonicalize would return undefined', () => {
  expect(() => canonicalJSON(undefined)).toThrow()
})
