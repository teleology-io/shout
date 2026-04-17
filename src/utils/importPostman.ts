import type { Collection, CollectionGroup, SavedRequest, KeyValue, Auth, RequestBody, HttpMethod } from '../types'

// ── Postman collection v2.1 parser ────────────────────────────────────────────

interface PostmanUrl {
  raw?: string
  host?: string[]
  path?: string[]
  query?: Array<{ key: string; value: string; disabled?: boolean }>
  protocol?: string
  port?: string
}

interface PostmanHeader {
  key: string
  value: string
  disabled?: boolean
  description?: string
}

interface PostmanAuth {
  type: string
  bearer?: Array<{ key: string; value: string }>
  basic?: Array<{ key: string; value: string }>
  apikey?: Array<{ key: string; value: string }>
}

interface PostmanBody {
  mode?: 'raw' | 'urlencoded' | 'formdata' | 'graphql'
  raw?: string
  options?: { raw?: { language?: string } }
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>
  formdata?: Array<{ key: string; value: string; disabled?: boolean }>
  graphql?: { query?: string; variables?: string }
}

interface PostmanRequest {
  method?: string
  header?: PostmanHeader[]
  url?: string | PostmanUrl
  body?: PostmanBody
  auth?: PostmanAuth
  description?: string
}

interface PostmanItem {
  id?: string
  name?: string
  request?: PostmanRequest
  item?: PostmanItem[]  // folder if present
  description?: string
}

interface PostmanCollection {
  info?: { name?: string }
  item?: PostmanItem[]
  variable?: Array<{ key: string; value: string; disabled?: boolean }>
}

function parseUrl(url: string | PostmanUrl | undefined): { raw: string; params: KeyValue[] } {
  if (!url) return { raw: '', params: [] }
  if (typeof url === 'string') return { raw: url, params: [] }

  const raw = url.raw ?? ''
  const params: KeyValue[] = (url.query ?? []).map((q) => ({
    id: crypto.randomUUID(),
    key: q.key ?? '',
    value: q.value ?? '',
    enabled: !q.disabled,
  }))
  return { raw, params }
}

function parseHeaders(headers: PostmanHeader[] | undefined): KeyValue[] {
  return (headers ?? []).map((h) => ({
    id: crypto.randomUUID(),
    key: h.key ?? '',
    value: h.value ?? '',
    enabled: !h.disabled,
    description: h.description,
  }))
}

function parseBody(body: PostmanBody | undefined): RequestBody {
  if (!body) return { type: 'none', content: '' }
  switch (body.mode) {
    case 'raw': {
      const lang = body.options?.raw?.language ?? ''
      const type = lang === 'graphql' ? 'graphql' : (lang === 'json' || (body.raw ?? '').trimStart().startsWith('{') || (body.raw ?? '').trimStart().startsWith('[')) ? 'json' : 'text'
      if (type === 'graphql') {
        const gql = body.graphql ?? { query: body.raw ?? '' }
        return { type: 'graphql', content: gql.query ?? '', variables: gql.variables }
      }
      return { type, content: body.raw ?? '' }
    }
    case 'graphql': {
      const gql = body.graphql ?? {}
      return { type: 'graphql', content: gql.query ?? '', variables: gql.variables }
    }
    case 'urlencoded': {
      const fields: KeyValue[] = (body.urlencoded ?? []).map((f) => ({
        id: crypto.randomUUID(),
        key: f.key ?? '',
        value: f.value ?? '',
        enabled: !f.disabled,
      }))
      return { type: 'form', content: '', fields }
    }
    default:
      return { type: 'none', content: '' }
  }
}

function parseAuth(auth: PostmanAuth | undefined): Auth {
  if (!auth) return { type: 'none' }
  const kv = (arr: Array<{ key: string; value: string }> | undefined): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const item of arr ?? []) map[item.key] = item.value
    return map
  }
  switch (auth.type) {
    case 'bearer': {
      const m = kv(auth.bearer)
      return { type: 'bearer', token: m['token'] ?? '' }
    }
    case 'basic': {
      const m = kv(auth.basic)
      return { type: 'basic', username: m['username'] ?? '', password: m['password'] ?? '' }
    }
    case 'apikey': {
      const m = kv(auth.apikey)
      return { type: 'apikey', key: m['key'] ?? '', value: m['value'] ?? '', addTo: m['in'] === 'query' ? 'query' : 'header' }
    }
    default:
      return { type: 'none' }
  }
}

function parseItem(item: PostmanItem, collectionId: string): SavedRequest | CollectionGroup | null {
  if (item.item) {
    // It's a folder
    const requests: SavedRequest[] = []
    const groups: CollectionGroup[] = []
    for (const child of item.item) {
      const parsed = parseItem(child, collectionId)
      if (!parsed) continue
      if ('method' in parsed) requests.push(parsed)
      else groups.push(parsed)
    }
    const group: CollectionGroup = {
      id: item.id ?? crypto.randomUUID(),
      name: item.name ?? 'Group',
      requests,
      groups,
    }
    return group
  }

  if (item.request) {
    const req = item.request
    const { raw, params: urlParams } = parseUrl(req.url)
    const headers = parseHeaders(req.header)

    // Merge url params with any already in parsed headers
    const body = parseBody(req.body)
    const auth = parseAuth(req.auth)

    const saved: SavedRequest = {
      id: item.id ?? crypto.randomUUID(),
      name: item.name ?? 'Untitled',
      collectionId,
      method: ((req.method ?? 'GET').toUpperCase() as HttpMethod),
      url: raw,
      headers,
      params: urlParams,
      body,
      auth,
      description: typeof req.description === 'string' ? req.description : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    return saved
  }

  return null
}

export function importPostman(json: unknown): Collection {
  const data = json as PostmanCollection
  const id = crypto.randomUUID()
  const name = data.info?.name ?? 'Postman Import'

  const requests: SavedRequest[] = []
  const groups: CollectionGroup[] = []

  for (const item of data.item ?? []) {
    const parsed = parseItem(item, id)
    if (!parsed) continue
    if ('method' in parsed) requests.push(parsed)
    else groups.push(parsed)
  }

  return {
    id,
    name,
    requests,
    groups,
    environments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function looksLikePostman(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  const obj = json as Record<string, unknown>
  return (
    typeof obj['info'] === 'object' &&
    typeof (obj['info'] as Record<string, unknown>)['name'] === 'string' &&
    Array.isArray(obj['item'])
  )
}
