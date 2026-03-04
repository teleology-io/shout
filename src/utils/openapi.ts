import yaml from 'js-yaml'
import type { Collection, CollectionGroup, SavedRequest, HttpMethod, KeyValue, RequestBody } from '../types'

interface OpenApiSpec {
  openapi?: string
  swagger?: string
  info?: { title?: string; description?: string; version?: string }
  host?: string
  basePath?: string
  servers?: Array<{ url: string; description?: string }>
  paths?: Record<string, PathItem>
  components?: { schemas?: Record<string, unknown> }
}

type PathItem = Record<string, OperationObject | unknown>

interface OperationObject {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: ParameterObject[]
  requestBody?: {
    content?: Record<string, { schema?: SchemaObject }>
    required?: boolean
  }
  responses?: Record<string, unknown>
}

interface ParameterObject {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: SchemaObject
  example?: unknown
}

interface SchemaObject {
  type?: string
  example?: unknown
  properties?: Record<string, SchemaObject>
  items?: SchemaObject
  $ref?: string
  nullable?: boolean
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

function parseSpec(text: string): OpenApiSpec {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as OpenApiSpec
  }
  return yaml.load(trimmed) as OpenApiSpec
}

function getBaseUrl(spec: OpenApiSpec): string {
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0].url.replace(/\/$/, '')
  }
  if (spec.host) {
    const scheme = 'https'
    const basePath = spec.basePath ?? ''
    return `${scheme}://${spec.host}${basePath}`
  }
  return ''
}

function schemaToExample(schema?: SchemaObject): string {
  if (!schema) return ''
  if (schema.example !== undefined) return String(schema.example)
  if (schema.type === 'object' && schema.properties) {
    const obj: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(schema.properties)) {
      obj[key] = prop.example ?? getDefaultForType(prop.type)
    }
    return JSON.stringify(obj, null, 2)
  }
  if (schema.type === 'array') {
    return '[]'
  }
  return getDefaultForType(schema.type)
}

function getDefaultForType(type?: string): string {
  switch (type) {
    case 'string': return 'string'
    case 'number':
    case 'integer': return '0'
    case 'boolean': return 'true'
    case 'object': return '{}'
    case 'array': return '[]'
    default: return ''
  }
}

// ── GraphQL detection ──────────────────────────────────────────────────────────
// Per https://graphql.org/learn/serving-over-http/, a GraphQL server exposes a
// SINGLE endpoint (e.g. /graphql). All operations POST { query, variables,
// operationName }. Detection is based on the request body schema — NOT on URL
// or path patterns.

function isGraphQlRequestBody(rb: OperationObject['requestBody']): boolean {
  if (!rb?.content) return false
  // Explicit GraphQL content type
  if (rb.content['application/graphql']) return true
  // Standard JSON body whose schema has a `query` string property
  const schema = rb.content['application/json']?.schema
  if (schema?.properties && 'query' in schema.properties) return true
  return false
}

// ── Request body builder ───────────────────────────────────────────────────────

function buildRequestBody(operation: OperationObject): RequestBody {
  const rb = operation.requestBody
  if (!rb?.content) return { type: 'none', content: '' }

  if (isGraphQlRequestBody(rb)) {
    // Return an empty GraphQL body — the user writes their own query
    return { type: 'graphql', content: '', variables: '' }
  }

  if (rb.content['application/json']) {
    const schema = rb.content['application/json'].schema
    const example = schemaToExample(schema)
    return { type: 'json', content: example }
  }
  if (rb.content['application/x-www-form-urlencoded']) {
    return { type: 'form', content: '', fields: [] }
  }
  if (rb.content['text/plain']) {
    return { type: 'text', content: '' }
  }

  return { type: 'json', content: '' }
}

function buildParams(parameters: ParameterObject[], kind: 'query' | 'path'): KeyValue[] {
  return parameters
    .filter((p) => p.in === kind)
    .map((p) => ({
      id: crypto.randomUUID(),
      key: p.name,
      value: p.example ? String(p.example) : (p.schema?.example ? String(p.schema.example) : ''),
      enabled: true,
      description: p.description,
    }))
}

function buildHeaders(parameters: ParameterObject[]): KeyValue[] {
  return parameters
    .filter((p) => p.in === 'header')
    .map((p) => ({
      id: crypto.randomUUID(),
      key: p.name,
      value: '',
      enabled: true,
      description: p.description,
    }))
}

function operationToRequest(
  path: string,
  method: HttpMethod,
  operation: OperationObject,
  baseUrl: string,
  collectionId: string
): SavedRequest {
  const parameters = operation.parameters ?? []
  const queryParams = buildParams(parameters, 'query')
  const headers = buildHeaders(parameters)

  // Replace path params like {id} → :id style for display, keep as {id} in URL
  const fullUrl = `${baseUrl}${path}`

  const name =
    operation.summary ||
    operation.operationId ||
    `${method} ${path}`

  return {
    id: crypto.randomUUID(),
    name,
    collectionId,
    description: operation.description,
    method,
    url: fullUrl,
    headers,
    params: queryParams,
    body: buildRequestBody(operation),
    auth: { type: 'none' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// Extract a group name: all literal segments before the first {param}, skipping leading version segments.
// e.g. /v1/users/{id}/posts  →  "users"
//      /api/users/{id}        →  "api/users"
//      /users/{id}/posts/{n}  →  "users"   (stops at first {param})
function getPathGroup(path: string): string | null {
  const segments = path.split('/').filter(Boolean)
  let i = 0
  // Skip leading version segments (v1, v2, …)
  while (i < segments.length && /^v\d+$/i.test(segments[i])) i++
  // Collect every literal segment until we hit a path param
  const known: string[] = []
  while (i < segments.length && !segments[i].startsWith('{')) {
    known.push(segments[i])
    i++
  }
  return known.length > 0 ? known.join('/') : null
}

export async function parseOpenApiText(text: string): Promise<Collection> {
  const spec = parseSpec(text)
  const baseUrl = getBaseUrl(spec)
  const collectionId = crypto.randomUUID()
  const name = spec.info?.title ?? 'Imported API'

  // Build all requests with their associated group tag
  const tagged: { request: SavedRequest; tag: string | null }[] = []

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as PathItem)[method.toLowerCase()]
      if (!operation || typeof operation !== 'object') continue
      const op = operation as OperationObject
      const request = operationToRequest(path, method, op, baseUrl, collectionId)
      const tag = op.tags?.[0] ?? getPathGroup(path)
      tagged.push({ request, tag: tag ?? null })
    }
  }

  // Group requests by tag; ungrouped go to root
  const groupMap = new Map<string, SavedRequest[]>()
  const ungrouped: SavedRequest[] = []

  for (const { request, tag } of tagged) {
    if (tag) {
      const existing = groupMap.get(tag) ?? []
      existing.push(request)
      groupMap.set(tag, existing)
    } else {
      ungrouped.push(request)
    }
  }

  const groups: CollectionGroup[] = Array.from(groupMap.entries()).map(([groupName, requests]) => ({
    id: crypto.randomUUID(),
    name: groupName,
    requests,
  }))

  return {
    id: collectionId,
    name,
    description: spec.info?.description,
    requests: ungrouped,
    groups,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    openApiSpec: text,
  }
}

export async function parseOpenApiUrl(url: string): Promise<Collection> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  return parseOpenApiText(text)
}

export function parseOpenApiFile(file: File): Promise<Collection> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      parseOpenApiText(text).then(resolve).catch(reject)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
