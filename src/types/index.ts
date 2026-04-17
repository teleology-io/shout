export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'

export type RequestKind = 'http' | 'ws' | 'sse'

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

export type BodyType = 'none' | 'json' | 'text' | 'form' | 'multipart' | 'graphql'

export interface RequestBody {
  type: BodyType
  content: string
  fields?: KeyValue[]
  variables?: string  // GraphQL variables as JSON string
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'inherit' | 'jwt' | 'awssigv4' | 'oauth2'

export interface JwtConfig {
  algorithm: 'HS256' | 'HS384' | 'HS512'
  secret: string
  payload: string        // JSON string of claims
  addExpiry: boolean
  expirySeconds: number  // default 3600
}

export interface AwsSigV4Config {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  service: string
}

export interface OAuth2Config {
  grantType: 'client_credentials' | 'authorization_code'
  tokenUrl: string
  authUrl?: string       // only for auth code flow
  clientId: string
  clientSecret: string
  redirectUri?: string
  scope?: string
  pkce?: boolean
  // cached token
  accessToken?: string
  refreshToken?: string
  tokenExpiry?: number   // unix timestamp
}

export interface Auth {
  type: AuthType
  token?: string
  username?: string
  password?: string
  key?: string
  value?: string
  addTo?: 'header' | 'query'
  jwt?: JwtConfig
  awsSigV4?: AwsSigV4Config
  oauth2?: OAuth2Config
}

export interface ProxyConfig {
  enabled: boolean
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  authUsername?: string
  authPassword?: string
}

export interface ResponseExtraction {
  id: string
  enabled: boolean
  from: 'body' | 'header'
  path: string      // JSONPath for body (e.g. $.data.token), header name for header
  envVar: string    // target env variable name
}

export interface Cookie {
  id: string
  name: string
  value: string
  domain: string
  path: string
  expires?: number   // unix timestamp
  httpOnly: boolean
  secure: boolean
}

export interface CookieJar {
  cookies: Cookie[]
}

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface WsMessage {
  id: string
  direction: 'sent' | 'received'
  data: string
  ts: number
}

export type SseStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface SseEvent {
  id?: string
  eventType: string
  data: string
  ts: number
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
  extractions?: ResponseExtraction[]
  responseHistory?: HistoricResponse[]
  createdAt: number
  updatedAt: number
}

export interface CollectionGroup {
  id: string
  name: string
  requests: SavedRequest[]
  groups?: CollectionGroup[]       // nested sub-folders
  variables?: EnvVariable[]        // folder-level variables
  auth?: Auth                      // auth inheritance
}

export interface Collection {
  id: string
  name: string
  description?: string
  requests: SavedRequest[]      // root-level (ungrouped)
  groups?: CollectionGroup[]    // grouped folders — optional for backwards compat
  environments?: Environment[]
  activeEnvironmentId?: string | null
  auth?: Auth                   // collection-level auth inheritance
  cookieJar?: CookieJar
  proxy?: ProxyConfig
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

export interface HistoricResponse extends ResponseData {
  id: string
  sentAt: number
}

export interface RequestTab {
  id: string
  name: string
  savedRequestId?: string
  collectionId?: string
  isDirty: boolean
  requestKind?: RequestKind      // defaults to 'http'
  method: HttpMethod
  url: string
  headers: KeyValue[]
  params: KeyValue[]
  body: RequestBody
  auth: Auth
  description?: string
  extractions?: ResponseExtraction[]
  response?: ResponseData
  isLoading: boolean
  error?: string
  // WebSocket state (not persisted)
  wsStatus?: WsStatus
  wsMessages?: WsMessage[]
  // SSE state (not persisted)
  sseStatus?: SseStatus
  sseEvents?: SseEvent[]
  // Streaming state (not persisted)
  streamMode?: boolean
  streamChunks?: string[]
  streamComplete?: boolean
  // Cookies
  sendCookies?: boolean
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

export const WS_COLOR = '#f5a623'
export const SSE_COLOR = '#4caf50'

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
    requestKind: 'http',
    method: 'GET',
    url: '',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
    isLoading: false,
    wsStatus: 'idle',
    wsMessages: [],
    sseStatus: 'idle',
    sseEvents: [],
    streamMode: false,
    streamChunks: [],
    streamComplete: false,
    sendCookies: false,
    extractions: [],
    ...partial,
  }
}
