import { test, expect } from 'bun:test'
import {
  generateKeyPair,
  didKeyFromPublicKey,
  publicKeyFromDidKey,
  verificationMethodId,
} from '../src/keys.ts'
import { signCompact, verifyCompact } from '../src/jws.ts'

test('compact JWS roundtrips a JSON payload', async () => {
  const kp = await generateKeyPair()
  const did = didKeyFromPublicKey(kp.publicKey)
  const kid = verificationMethodId(did)
  const payload = { v: 'agent-pay/0.1', hello: 'world' }
  const token = await signCompact(payload, kp.privateKey, kid)
  expect(token.split('.').length).toBe(3)
  const res = await verifyCompact(token, async (k) => {
    expect(k).toBe(kid)
    return publicKeyFromDidKey(did)
  })
  expect(res.payload).toEqual(payload)
  expect(res.kid).toBe(kid)
})

test('verifyCompact rejects a tampered payload', async () => {
  const kp = await generateKeyPair()
  const kid = verificationMethodId(didKeyFromPublicKey(kp.publicKey))
  const token = await signCompact({ a: 1 }, kp.privateKey, kid)
  const [h, p, s] = token.split('.') as [string, string, string]
  const bad = `${h}.${p}AA.${s}`
  await expect(verifyCompact(bad, async () => kp.publicKey)).rejects.toThrow(/signature/i)
})

test('verifyCompact rejects an unsupported alg', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'x' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ a: 1 })).toString('base64url')
  const sig = 'AAAA'
  const token = `${header}.${payload}.${sig}`
  await expect(verifyCompact(token, async () => new Uint8Array(32))).rejects.toThrow(/alg/i)
})
