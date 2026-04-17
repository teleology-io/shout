import type { Collection, CollectionGroup, SavedRequest, KeyValue } from '../types'

// ── Export as Postman Collection v2.1 ─────────────────────────────────────────

function kvToPostmanHeaders(headers: KeyValue[]) {
  return headers.map((h) => ({
    key: h.key,
    value: h.value,
    disabled: !h.enabled || undefined,
  }))
}

function kvToPostmanQuery(params: KeyValue[]) {
  return params.map((p) => ({
    key: p.key,
    value: p.value,
    disabled: !p.enabled || undefined,
  }))
}

function savedRequestToPostmanItem(req: SavedRequest) {
  // Build Postman URL object
  const urlRaw = req.url
  const urlObj: Record<string, unknown> = { raw: urlRaw }
  if (req.params.length > 0) {
    urlObj['query'] = kvToPostmanQuery(req.params)
  }

  // Body
  let body: Record<string, unknown> | undefined
  const b = req.body
  if (b.type === 'json') {
    body = { mode: 'raw', raw: b.content, options: { raw: { language: 'json' } } }
  } else if (b.type === 'text') {
    body = { mode: 'raw', raw: b.content, options: { raw: { language: 'text' } } }
  } else if (b.type === 'form') {
    body = {
      mode: 'urlencoded',
      urlencoded: (b.fields ?? []).map((f) => ({ key: f.key, value: f.value, disabled: !f.enabled || undefined })),
    }
  } else if (b.type === 'graphql') {
    body = { mode: 'graphql', graphql: { query: b.content, variables: b.variables ?? '' } }
  }

  // Auth
  let auth: Record<string, unknown> | undefined
  const a = req.auth
  if (a.type === 'bearer') {
    auth = { type: 'bearer', bearer: [{ key: 'token', value: a.token ?? '', type: 'string' }] }
  } else if (a.type === 'basic') {
    auth = {
      type: 'basic',
      basic: [
        { key: 'username', value: a.username ?? '', type: 'string' },
        { key: 'password', value: a.password ?? '', type: 'string' },
      ],
    }
  } else if (a.type === 'apikey') {
    auth = {
      type: 'apikey',
      apikey: [
        { key: 'key', value: a.key ?? '', type: 'string' },
        { key: 'value', value: a.value ?? '', type: 'string' },
        { key: 'in', value: a.addTo ?? 'header', type: 'string' },
      ],
    }
  } else if (a.type !== 'inherit') {
    auth = { type: 'noauth' }
  }

  return {
    id: req.id,
    name: req.name,
    request: {
      method: req.method,
      header: kvToPostmanHeaders(req.headers),
      url: urlObj,
      body,
      auth,
      description: req.description,
    },
    response: [],
  }
}

function groupToPostmanFolder(group: CollectionGroup): Record<string, unknown> {
  return {
    name: group.name,
    item: [
      ...(group.groups ?? []).map(groupToPostmanFolder),
      ...group.requests.map(savedRequestToPostmanItem),
    ],
  }
}

export function exportPostman(collection: Collection): string {
  const postman = {
    info: {
      _postman_id: collection.id,
      name: collection.name,
      description: collection.description ?? '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      ...(collection.groups ?? []).map(groupToPostmanFolder),
      ...collection.requests.map(savedRequestToPostmanItem),
    ],
  }
  return JSON.stringify(postman, null, 2)
}

// ── Export as Insomnia v4 ─────────────────────────────────────────────────────

function savedRequestToInsomnia(req: SavedRequest, parentId: string) {
  let bodyData: Record<string, unknown> = {}
  const b = req.body
  if (b.type === 'json') {
    bodyData = { mimeType: 'application/json', text: b.content }
  } else if (b.type === 'text') {
    bodyData = { mimeType: 'text/plain', text: b.content }
  } else if (b.type === 'form') {
    bodyData = {
      mimeType: 'application/x-www-form-urlencoded',
      params: (b.fields ?? []).map((f) => ({ name: f.key, value: f.value, disabled: !f.enabled })),
    }
  } else if (b.type === 'graphql') {
    bodyData = { mimeType: 'application/graphql', text: b.content }
  }

  let auth: Record<string, unknown> = { type: 'none' }
  const a = req.auth
  if (a.type === 'bearer') auth = { type: 'bearer', token: a.token ?? '' }
  else if (a.type === 'basic') auth = { type: 'basic', username: a.username ?? '', password: a.password ?? '' }
  else if (a.type === 'apikey') auth = { type: 'apikey', key: a.key ?? '', value: a.value ?? '', addTo: a.addTo ?? 'header' }

  return {
    _id: req.id,
    _type: 'request',
    parentId,
    name: req.name,
    method: req.method,
    url: req.url,
    description: req.description ?? '',
    headers: req.headers.map((h) => ({ name: h.key, value: h.value, disabled: !h.enabled })),
    parameters: req.params.map((p) => ({ name: p.key, value: p.value, disabled: !p.enabled })),
    body: bodyData,
    authentication: auth,
  }
}

export function exportInsomnia(collection: Collection): string {
  const workspaceId = `wrk_${collection.id.replace(/-/g, '').slice(0, 16)}`
  const resources: unknown[] = [
    {
      _id: workspaceId,
      _type: 'workspace',
      parentId: null,
      name: collection.name,
      description: collection.description ?? '',
      scope: 'collection',
    },
  ]

  function addGroup(group: CollectionGroup, parentId: string) {
    const groupId = `fld_${group.id.replace(/-/g, '').slice(0, 16)}`
    resources.push({
      _id: groupId,
      _type: 'request_group',
      parentId,
      name: group.name,
      description: '',
    })
    for (const req of group.requests) {
      resources.push(savedRequestToInsomnia(req, groupId))
    }
    for (const subGroup of group.groups ?? []) {
      addGroup(subGroup, groupId)
    }
  }

  for (const group of collection.groups ?? []) {
    addGroup(group, workspaceId)
  }
  for (const req of collection.requests) {
    resources.push(savedRequestToInsomnia(req, workspaceId))
  }

  const out = {
    _type: 'export',
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: 'shout',
    resources,
  }
  return JSON.stringify(out, null, 2)
}

// ── Export as native shout JSON ───────────────────────────────────────────────

export function exportNative(collection: Collection): string {
  return JSON.stringify(collection, null, 2)
}

// ── Trigger download ──────────────────────────────────────────────────────────

export function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
