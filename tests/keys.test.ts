import { test, expect } from 'bun:test'
import {
  generateKeyPair,
  didKeyFromPublicKey,
  publicKeyFromDidKey,
  verificationMethodId,
} from '../src/keys.ts'

test('generateKeyPair returns a 32-byte secret + 32-byte public', async () => {
  const kp = await generateKeyPair()
  expect(kp.privateKey.length).toBe(32)
  expect(kp.publicKey.length).toBe(32)
})

test('did:key roundtrips an Ed25519 public key', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  expect(did.startsWith('did:key:z')).toBe(true)
  const back = publicKeyFromDidKey(did)
  expect(back).toEqual(kp.publicKey)
})

test('publicKeyFromDidKey rejects non-did:key strings', () => {
  expect(() => publicKeyFromDidKey('did:web:example.com')).toThrow()
})

test('verificationMethodId for did:key uses the multibase as fragment', () => {
  const did = 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH'
  expect(verificationMethodId(did)).toBe(`${did}#z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH`)
})
