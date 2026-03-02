export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'

export interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
}

export interface EnvVariable {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvVariable[]
}

export type BodyType = 'none' | 'json' | 'text' | 'form' | 'graphql'

export interface RequestBody {
  type: BodyType
  content: string
  fields?: KeyValue[]
  variables?: string  // GraphQL variables as JSON string
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey'

export interface Auth {
  type: AuthType
  token?: string
  username?: string
  password?: string
  key?: string
  value?: string
  addTo?: 'header' | 'query'
}

export interface RequestData {
  method: HttpMethod
  url: string
  headers: KeyValue[]
  params: KeyValue[]
  body: RequestBody
  auth: Auth
}

export interface SavedRequest extends RequestData {
  id: string
  name: string
  collectionId: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface CollectionGroup {
  id: string
  name: string
  requests: SavedRequest[]
}

export interface Collection {
  id: string
  name: string
  description?: string
  requests: SavedRequest[]      // root-level (ungrouped)
  groups?: CollectionGroup[]    // grouped folders — optional for backwards compat
  environments?: Environment[]
  activeEnvironmentId?: string | null
  createdAt: number
  updatedAt: number
  openApiSpec?: string
}

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  bodyEncoding?: 'utf8' | 'base64'
  size: number
  time: number
  contentType?: string
}

export interface RequestTab {
  id: string
  name: string
  savedRequestId?: string
  collectionId?: string
  isDirty: boolean
  method: HttpMethod
  url: string
  headers: KeyValue[]
  params: KeyValue[]
  body: RequestBody
  auth: Auth
  response?: ResponseData
  isLoading: boolean
  error?: string
}

export const DEFAULT_REQUEST_BODY: RequestBody = {
  type: 'none',
  content: '',
}

export const DEFAULT_AUTH: Auth = {
  type: 'none',
}

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  PATCH: '#50e3c2',
  DELETE: '#f93e3e',
  HEAD: '#9012fe',
  OPTIONS: '#0d5aa7',
}

export function newKeyValue(): KeyValue {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
  }
}

export function newTab(partial?: Partial<RequestTab>): RequestTab {
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    isDirty: false,
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
    isLoading: false,
    ...partial,
  }
}
