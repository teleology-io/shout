import type { Collection, CollectionGroup, SavedRequest, KeyValue, Auth, RequestBody, HttpMethod } from '../types'

// ── Insomnia v4 export parser ─────────────────────────────────────────────────

interface InsomniaResource {
  _type: string
  _id: string
  parentId?: string
  name?: string
  method?: string
  url?: string
  headers?: Array<{ name: string; value: string; disabled?: boolean }>
  parameters?: Array<{ name: string; value: string; disabled?: boolean }>
  body?: {
    mimeType?: string
    text?: string
    params?: Array<{ name: string; value: string; disabled?: boolean }>
  }
  authentication?: {
    type?: string
    token?: string
    username?: string
    password?: string
    key?: string
    value?: string
    addTo?: string
    prefix?: string
  }
  description?: string
}

interface InsomniaExport {
  _type?: string
  __export_format?: number
  resources?: InsomniaResource[]
}

function parseHeaders(headers: InsomniaResource['headers']): KeyValue[] {
  return (headers ?? []).map((h) => ({
    id: crypto.randomUUID(),
    key: h.name ?? '',
    value: h.value ?? '',
    enabled: !h.disabled,
  }))
}

function parseParams(params: InsomniaResource['parameters']): KeyValue[] {
  return (params ?? []).map((p) => ({
    id: crypto.randomUUID(),
    key: p.name ?? '',
    value: p.value ?? '',
    enabled: !p.disabled,
  }))
}

function parseBody(body: InsomniaResource['body']): RequestBody {
  if (!body) return { type: 'none', content: '' }
  const mime = body.mimeType ?? ''

  if (mime.includes('graphql')) {
    return { type: 'graphql', content: body.text ?? '' }
  }
  if (mime.includes('json')) {
    return { type: 'json', content: body.text ?? '' }
  }
  if (mime.includes('form') && body.params) {
    const fields: KeyValue[] = (body.params ?? []).map((p) => ({
      id: crypto.randomUUID(),
      key: p.name ?? '',
      value: p.value ?? '',
      enabled: !p.disabled,
    }))
    return { type: 'form', content: '', fields }
  }
  if (body.text) {
    // Try to detect JSON by content
    const trimmed = body.text.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { type: 'json', content: body.text }
    }
    return { type: 'text', content: body.text }
  }
  return { type: 'none', content: '' }
}

function parseAuth(auth: InsomniaResource['authentication']): Auth {
  if (!auth || !auth.type) return { type: 'none' }
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', token: auth.token ?? '' }
    case 'basic':
      return { type: 'basic', username: auth.username ?? '', password: auth.password ?? '' }
    case 'apikey':
      return {
        type: 'apikey',
        key: auth.key ?? '',
        value: auth.value ?? '',
        addTo: auth.addTo === 'query' ? 'query' : 'header',
      }
    default:
      return { type: 'none' }
  }
}

export function importInsomnia(json: unknown): Collection {
  const data = json as InsomniaExport
  const resources = data.resources ?? []

  // Find workspace (top-level parent)
  const workspace = resources.find((r) => r._type === 'workspace')
  const workspaceId = workspace?._id ?? ''
  const name = workspace?.name ?? 'Insomnia Import'
  const collectionId = crypto.randomUUID()

  // Build group map
  const groupMap = new Map<string, CollectionGroup>()
  const groupOrder: string[] = []
  for (const r of resources) {
    if (r._type === 'request_group') {
      groupMap.set(r._id, {
        id: r._id,
        name: r.name ?? 'Group',
        requests: [],
        groups: [],
      })
      groupOrder.push(r._id)
    }
  }

  // Link sub-groups to parent groups
  for (const r of resources) {
    if (r._type === 'request_group' && r.parentId && r.parentId !== workspaceId) {
      const parent = groupMap.get(r.parentId)
      const child = groupMap.get(r._id)
      if (parent && child) {
        parent.groups = parent.groups ?? []
        parent.groups.push(child)
      }
    }
  }

  // Place requests
  const rootRequests: SavedRequest[] = []
  for (const r of resources) {
    if (r._type !== 'request') continue

    const saved: SavedRequest = {
      id: r._id,
      name: r.name ?? 'Untitled',
      collectionId,
      method: ((r.method ?? 'GET').toUpperCase() as HttpMethod),
      url: r.url ?? '',
      headers: parseHeaders(r.headers),
      params: parseParams(r.parameters),
      body: parseBody(r.body),
      auth: parseAuth(r.authentication),
      description: r.description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (r.parentId && r.parentId !== workspaceId) {
      const group = groupMap.get(r.parentId)
      if (group) {
        group.requests.push(saved)
        continue
      }
    }
    rootRequests.push(saved)
  }

  // Collect only top-level groups (those whose parent is the workspace)
  const topGroups: CollectionGroup[] = []
  for (const id of groupOrder) {
    const r = resources.find((res) => res._id === id)
    if (!r) continue
    if (!r.parentId || r.parentId === workspaceId) {
      const g = groupMap.get(id)
      if (g) topGroups.push(g)
    }
  }

  return {
    id: collectionId,
    name,
    requests: rootRequests,
    groups: topGroups,
    environments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function looksLikeInsomnia(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false
  const obj = json as Record<string, unknown>
  return (
    obj['_type'] === 'export' &&
    Array.isArray(obj['resources'])
  )
}
