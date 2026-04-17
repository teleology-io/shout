import type { JwtConfig } from '../types'

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function b64urlString(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const ALG_MAP: Record<JwtConfig['algorithm'], string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
}

export async function signJwt(config: JwtConfig): Promise<string> {
  const header = { alg: config.algorithm, typ: 'JWT' }

  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(config.payload || '{}')
  } catch {
    claims = {}
  }

  if (config.addExpiry) {
    const now = Math.floor(Date.now() / 1000)
    if (!('iat' in claims)) claims.iat = now
    if (!('exp' in claims)) claims.exp = now + (config.expirySeconds || 3600)
  }

  const headerB64 = b64urlString(JSON.stringify(header))
  const payloadB64 = b64urlString(JSON.stringify(claims))
  const signingInput = `${headerB64}.${payloadB64}`

  const keyData = new TextEncoder().encode(config.secret || '')
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: ALG_MAP[config.algorithm] },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${b64url(signature)}`
}

/** Decode a JWT (without verification) to show the claims */
export function decodeJwt(token: string): { header: unknown; payload: unknown } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const decode = (s: string) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')))
    return { header: decode(parts[0]), payload: decode(parts[1]) }
  } catch {
    return null
  }
}
