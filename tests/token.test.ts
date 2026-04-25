import { test, expect } from 'bun:test'
import { issueToken, verifyToken } from '../src/token.ts'

const SECRET = new TextEncoder().encode('thirty-two-byte-test-secret-pad!')

test('issueToken/verifyToken roundtrips payment_hash + expires_at', async () => {
  const tok = await issueToken({
    payment_hash: 'a'.repeat(64),
    expires_at: '2030-01-01T00:00:00Z',
    secret: SECRET,
  })
  const payload = await verifyToken(tok, SECRET)
  expect(payload.payment_hash).toBe('a'.repeat(64))
  expect(payload.expires_at).toBe('2030-01-01T00:00:00Z')
})

test('verifyToken rejects HMAC mismatch (wrong secret)', async () => {
  const tok = await issueToken({
    payment_hash: 'a'.repeat(64),
    expires_at: '2030-01-01T00:00:00Z',
    secret: SECRET,
  })
  const otherSecret = new TextEncoder().encode('different-thirty-two-byte-secret')
  await expect(verifyToken(tok, otherSecret)).rejects.toThrow(/hmac/i)
})

test('verifyToken rejects malformed token', async () => {
  await expect(verifyToken('not.a.valid.token', SECRET)).rejects.toThrow()
})
