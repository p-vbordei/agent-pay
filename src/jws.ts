import * as ed from '@noble/ed25519'
import { canonicalJSON } from './jcs.ts'

const HEADER = { alg: 'EdDSA', typ: 'JWS' as const }

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}
function b64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'))
}

export type ResolveKey = (kid: string) => Promise<Uint8Array>

export async function signCompact(
  payload: unknown,
  privateKey: Uint8Array,
  kid: string,
): Promise<string> {
  const headerBytes = canonicalJSON({ ...HEADER, kid })
  const payloadBytes = canonicalJSON(payload)
  const headerB64 = b64url(headerBytes)
  const payloadB64 = b64url(payloadBytes)
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const sig = await ed.signAsync(signingInput, privateKey)
  return `${headerB64}.${payloadB64}.${b64url(sig)}`
}

export async function verifyCompact<T = unknown>(
  token: string,
  resolveKey: ResolveKey,
): Promise<{ payload: T; kid: string }> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('compact JWS must have 3 parts')
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64))) as {
    alg?: string
    kid?: string
  }
  if (header.alg !== 'EdDSA') throw new Error(`unsupported JWS alg: ${header.alg}`)
  if (!header.kid) throw new Error('JWS header missing kid')
  const publicKey = await resolveKey(header.kid)
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const ok = await ed.verifyAsync(b64urlDecode(sigB64), signingInput, publicKey)
  if (!ok) throw new Error('JWS signature verification failed')
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as T
  return { payload, kid: header.kid }
}
