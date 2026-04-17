import type { HttpMethod, KeyValue, RequestBody, Auth, RequestTab } from '../types'
import { newKeyValue } from '../types'

export interface ParsedCurl {
  method: HttpMethod
  url: string
  headers: KeyValue[]
  params: KeyValue[]
  body: RequestBody
  auth: Auth
}

/** Tokenize a shell command string, respecting single/double quotes and backslash continuations. */
function tokenize(input: string): string[] {
  // Normalize line continuations (\ at end of line)
  const normalized = input.replace(/\\\n\s*/g, ' ').trim()
  const tokens: string[] = []
  let i = 0

  while (i < normalized.length) {
    // Skip whitespace
    while (i < normalized.length && /\s/.test(normalized[i])) i++
    if (i >= normalized.length) break

    const ch = normalized[i]

    if (ch === "'") {
      // Single-quoted string
      i++
      let val = ''
      while (i < normalized.length && normalized[i] !== "'") {
        if (normalized[i] === '\\' && i + 1 < normalized.length && normalized[i + 1] === "'") {
          val += "'"
          i += 2
        } else {
          val += normalized[i++]
        }
      }
      i++ // closing quote
      tokens.push(val)
    } else if (ch === '"') {
      // Double-quoted string
      i++
      let val = ''
      while (i < normalized.length && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < normalized.length) {
          const next = normalized[i + 1]
          val += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
        } else {
          val += normalized[i++]
        }
      }
      i++ // closing quote
      tokens.push(val)
    } else {
      // Unquoted token
      let val = ''
      while (i < normalized.length && !/\s/.test(normalized[i])) {
        val += normalized[i++]
      }
      tokens.push(val)
    }
  }

  return tokens
}

/** Parse a URL and split out query params. */
function parseUrl(rawUrl: string): { url: string; params: KeyValue[] } {
  try {
    const u = new URL(rawUrl)
    const params: KeyValue[] = []
    u.searchParams.forEach((value, key) => {
      params.push({ ...newKeyValue(), key, value })
    })
    u.search = ''
    return { url: u.toString(), params }
  } catch {
    // Not a valid URL — return as-is
    const qIdx = rawUrl.indexOf('?')
    if (qIdx < 0) return { url: rawUrl, params: [] }
    const params: KeyValue[] = rawUrl
      .slice(qIdx + 1)
      .split('&')
      .map((part) => {
        const [k, ...rest] = part.split('=')
        return { ...newKeyValue(), key: decodeURIComponent(k), value: decodeURIComponent(rest.join('=')) }
      })
    return { url: rawUrl.slice(0, qIdx), params }
  }
}

/** Detect body content type from the data string and Content-Type header (if any). */
function detectBodyType(data: string, contentType?: string): RequestBody['type'] {
  if (contentType) {
    const ct = contentType.toLowerCase()
    if (ct.includes('json')) return 'json'
    if (ct.includes('x-www-form-urlencoded')) return 'form'
    if (ct.includes('graphql')) return 'graphql'
    return 'text'
  }
  try { JSON.parse(data); return 'json' } catch { /* not json */ }
  if (/^[^=&\s]+=/.test(data)) return 'form'
  return 'text'
}

/** Parse form-encoded data into KeyValue array. */
function parseFormData(data: string): KeyValue[] {
  return data.split('&').map((part) => {
    const [k, ...rest] = part.split('=')
    return { ...newKeyValue(), key: decodeURIComponent(k ?? ''), value: decodeURIComponent(rest.join('=')) }
  })
}

export function parseCurl(input: string): ParsedCurl | null {
  const tokens = tokenize(input)
  if (tokens.length === 0 || tokens[0] !== 'curl') return null

  let method: HttpMethod | undefined
  let rawUrl = ''
  const headerKvs: KeyValue[] = []
  let rawData: string | undefined
  let authStr: string | undefined
  const cookies: string[] = []

  let i = 1
  while (i < tokens.length) {
    const tok = tokens[i]

    if (tok === '-X' || tok === '--request') {
      method = (tokens[++i] as HttpMethod) ?? method
    } else if (tok === '-H' || tok === '--header') {
      const hdr = tokens[++i] ?? ''
      const colonIdx = hdr.indexOf(':')
      if (colonIdx >= 0) {
        headerKvs.push({
          ...newKeyValue(),
          key: hdr.slice(0, colonIdx).trim(),
          value: hdr.slice(colonIdx + 1).trim(),
        })
      }
    } else if (tok === '-d' || tok === '--data' || tok === '--data-raw' || tok === '--data-binary' || tok === '--data-urlencode') {
      rawData = tokens[++i] ?? ''
    } else if (tok === '-u' || tok === '--user') {
      authStr = tokens[++i]
    } else if (tok === '-b' || tok === '--cookie') {
      cookies.push(tokens[++i] ?? '')
    } else if (tok === '--url') {
      rawUrl = tokens[++i] ?? ''
    } else if (!tok.startsWith('-') && rawUrl === '') {
      rawUrl = tok
    }
    // skip unknown flags that have a value
    else if (tok.startsWith('-') && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
      // Some flags consume next token, best effort: skip pairs we don't know
      const knownValueless = new Set(['-v', '--verbose', '-s', '--silent', '-i', '--include', '-L', '--location', '-k', '--insecure', '-g', '--globoff', '-G', '--get'])
      if (!knownValueless.has(tok)) {
        // Check if it looks like a flag with value
        if (/^--\w/.test(tok) || /^-[a-zA-Z]$/.test(tok)) {
          // Heuristic: if next token doesn't start with -, it's probably a value
          if (!tokens[i + 1]?.startsWith('-')) i++
        }
      }
    }
    i++
  }

  if (!rawUrl) return null

  // Resolve URL + params
  const { url, params } = parseUrl(rawUrl)

  // Detect content-type header
  const ctHeader = headerKvs.find((h) => h.key.toLowerCase() === 'content-type')

  // Build body
  let body: RequestBody = { type: 'none', content: '' }
  if (rawData !== undefined) {
    const bodyType = detectBodyType(rawData, ctHeader?.value)
    if (bodyType === 'form') {
      body = { type: 'form', content: '', fields: parseFormData(rawData) }
    } else {
      body = { type: bodyType as RequestBody['type'], content: rawData }
    }
  }

  // Infer method
  const resolvedMethod: HttpMethod = method ?? (rawData !== undefined ? 'POST' : 'GET')

  // Build auth
  let auth: Auth = { type: 'none' }
  if (authStr) {
    const colonIdx = authStr.indexOf(':')
    auth = {
      type: 'basic',
      username: colonIdx >= 0 ? authStr.slice(0, colonIdx) : authStr,
      password: colonIdx >= 0 ? authStr.slice(colonIdx + 1) : '',
    }
  } else {
    const authHeader = headerKvs.find((h) => h.key.toLowerCase() === 'authorization')
    if (authHeader) {
      const val = authHeader.value
      if (val.toLowerCase().startsWith('bearer ')) {
        auth = { type: 'bearer', token: val.slice(7) }
        // Remove the Authorization header since we're using auth field
        const idx = headerKvs.indexOf(authHeader)
        if (idx >= 0) headerKvs.splice(idx, 1)
      } else if (val.toLowerCase().startsWith('basic ')) {
        try {
          const decoded = atob(val.slice(6))
          const [u, ...rest] = decoded.split(':')
          auth = { type: 'basic', username: u, password: rest.join(':') }
          const idx = headerKvs.indexOf(authHeader)
          if (idx >= 0) headerKvs.splice(idx, 1)
        } catch { /* keep as header */ }
      }
    }
  }

  // Add cookies as a header
  if (cookies.length > 0) {
    headerKvs.push({ ...newKeyValue(), key: 'Cookie', value: cookies.join('; ') })
  }

  return { method: resolvedMethod, url, headers: headerKvs, params, body, auth }
}

/** Returns true if the string looks like a curl command. */
export function looksLikeCurl(text: string): boolean {
  return text.trimStart().startsWith('curl ')
}

/** Apply parsed curl into a partial RequestTab update. */
export function parsedCurlToTab(parsed: ParsedCurl): Partial<RequestTab> {
  return {
    method: parsed.method,
    url: parsed.url,
    headers: parsed.headers,
    params: parsed.params,
    body: parsed.body,
    auth: parsed.auth,
    isDirty: true,
  }
}
