import type { Cookie, CookieJar } from '../types'

export function parseSetCookieHeader(header: string, requestUrl: string): Cookie | null {
  if (!header) return null
  const parts = header.split(';').map((p) => p.trim())
  if (!parts[0]) return null

  const eqIdx = parts[0].indexOf('=')
  if (eqIdx < 0) return null

  const name = parts[0].substring(0, eqIdx).trim()
  const value = parts[0].substring(eqIdx + 1).trim()
  if (!name) return null

  const attrs: Record<string, string> = {}
  for (const part of parts.slice(1)) {
    const i = part.indexOf('=')
    if (i >= 0) {
      attrs[part.substring(0, i).toLowerCase().trim()] = part.substring(i + 1).trim()
    } else {
      attrs[part.toLowerCase().trim()] = 'true'
    }
  }

  let domain = attrs['domain'] ?? ''
  if (!domain) {
    try { domain = new URL(requestUrl).hostname } catch { domain = '' }
  }
  // Remove leading dot if present (we handle it in matching)
  if (domain.startsWith('.')) domain = domain.slice(1)

  const path = attrs['path'] ?? '/'

  let expires: number | undefined
  if (attrs['max-age']) {
    const maxAge = parseInt(attrs['max-age'])
    if (!isNaN(maxAge)) expires = Math.floor(Date.now() / 1000) + maxAge
  } else if (attrs['expires']) {
    const d = new Date(attrs['expires'])
    if (!isNaN(d.getTime())) expires = Math.floor(d.getTime() / 1000)
  }

  return {
    id: crypto.randomUUID(),
    name,
    value,
    domain,
    path,
    expires,
    httpOnly: 'httponly' in attrs,
    secure: 'secure' in attrs,
  }
}

export function cookiesForRequest(jar: CookieJar, url: string): Cookie[] {
  try {
    const urlObj = new URL(url)
    const host = urlObj.hostname
    const now = Math.floor(Date.now() / 1000)
    return jar.cookies.filter((cookie) => {
      if (cookie.expires && cookie.expires < now) return false
      if (!host.endsWith(cookie.domain) && host !== cookie.domain) return false
      if (cookie.secure && urlObj.protocol !== 'https:') return false
      if (!urlObj.pathname.startsWith(cookie.path)) return false
      return true
    })
  } catch {
    return []
  }
}

export function formatCookieHeader(cookies: Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

/** Merge new cookies into existing jar (replace same name+domain+path) */
export function mergeCookies(jar: CookieJar, newCookies: Cookie[]): CookieJar {
  const result = [...jar.cookies]
  for (const nc of newCookies) {
    const idx = result.findIndex(
      (c) => c.name === nc.name && c.domain === nc.domain && c.path === nc.path
    )
    if (idx >= 0) {
      result[idx] = nc
    } else {
      result.push(nc)
    }
  }
  return { cookies: result }
}
