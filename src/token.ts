import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import { canonicalJSON } from './jcs.ts'

export type TokenPayload = {
  v: string
  payment_hash: string
  expires_at: string
}

const VERSION = 'agent-pay/0.1'

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}
function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export type IssueTokenOpts = {
  payment_hash: string
  expires_at: string
  secret: Uint8Array
}

export async function issueToken(opts: IssueTokenOpts): Promise<string> {
  const payload: TokenPayload = {
    v: VERSION,
    payment_hash: opts.payment_hash,
    expires_at: opts.expires_at,
  }
  const payloadBytes = canonicalJSON(payload)
  const sig = hmac(sha256, opts.secret, payloadBytes)
  return `${b64url(payloadBytes)}.${b64url(sig)}`
}

export async function verifyToken(token: string, secret: Uint8Array): Promise<TokenPayload> {
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('token must have 2 parts')
  const [payloadB64, sigB64] = parts as [string, string]
  const payloadBytes = b64urlDecode(payloadB64)
  const expected = hmac(sha256, secret, payloadBytes)
  const got = b64urlDecode(sigB64)
  if (!constantTimeEqual(expected, got)) throw new Error('token HMAC verification failed')
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as TokenPayload
  if (payload.v !== VERSION) throw new Error(`unsupported token version: ${payload.v}`)
  return payload
}
