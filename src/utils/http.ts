import type { RequestTab, ResponseData, KeyValue, Auth, ProxyConfig } from '../types'
import { signJwt } from './jwt'

// Check if running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function buildUrl(url: string, params: KeyValue[]): string {
  const enabled = params.filter((p) => p.enabled && p.key)
  if (enabled.length === 0) return url

  const base = url.includes('?') ? url : `${url}?`
  const qs = enabled.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
  return base.includes('?') && !base.endsWith('?') ? `${base}&${qs}` : `${base}${qs}`
}

function buildHeaders(headers: KeyValue[], auth: Auth, bodyType: string, jwtToken?: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Set content-type based on body type (multipart omitted — boundary set by reqwest/fetch)
  if (bodyType === 'json' || bodyType === 'graphql') {
    result['Content-Type'] = 'application/json'
  } else if (bodyType === 'text') {
    result['Content-Type'] = 'text/plain'
  } else if (bodyType === 'form') {
    result['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  // Auth headers
  if (auth.type === 'bearer' && auth.token) {
    result['Authorization'] = `Bearer ${auth.token}`
  } else if (auth.type === 'basic' && auth.username) {
    const encoded = btoa(`${auth.username}:${auth.password ?? ''}`)
    result['Authorization'] = `Basic ${encoded}`
  } else if (auth.type === 'apikey' && auth.key && (auth.addTo ?? 'header') === 'header') {
    result[auth.key] = auth.value ?? ''
  } else if (auth.type === 'jwt' && jwtToken) {
    result['Authorization'] = `Bearer ${jwtToken}`
  } else if (auth.type === 'oauth2' && auth.oauth2?.accessToken) {
    result['Authorization'] = `Bearer ${auth.oauth2.accessToken}`
  }

  // User-defined headers (override defaults)
  for (const h of headers) {
    if (h.enabled && h.key) {
      result[h.key] = h.value
    }
  }

  return result
}

function buildBody(tab: RequestTab): string | undefined {
  const { body, params: _params, auth } = tab

  // API key in query (handled in buildUrl above, but check for completeness)
  void auth

  if (body.type === 'none') return undefined
  if (body.type === 'json' || body.type === 'text') {
    return body.content || undefined
  }
  if (body.type === 'graphql') {
    let variables: unknown = undefined
    if (body.variables?.trim()) {
      try { variables = JSON.parse(body.variables) } catch { /* ignore malformed */ }
    }
    const payload: Record<string, unknown> = { query: body.content ?? '' }
    if (variables !== undefined) payload.variables = variables
    return JSON.stringify(payload)
  }
  if (body.type === 'form') {
    const fields = body.fields ?? []
    return fields
      .filter((f) => f.enabled && f.key)
      .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
      .join('&')
  }
  return undefined
}

function buildUrlWithAuth(url: string, params: KeyValue[], auth: Auth): string {
  const extraParams = [...params]
  if (auth.type === 'apikey' && auth.key && auth.addTo === 'query') {
    extraParams.push({
      id: 'auth-apikey',
      key: auth.key,
      value: auth.value ?? '',
      enabled: true,
    })
  }
  return buildUrl(url, extraParams)
}

export async function makeRequest(tab: RequestTab, proxy?: ProxyConfig): Promise<ResponseData> {
  // Sign JWT if needed
  let jwtToken: string | undefined
  if (tab.auth.type === 'jwt' && tab.auth.jwt) {
    jwtToken = await signJwt(tab.auth.jwt)
  }

  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type, jwtToken)
  const body = buildBody(tab)

  // For AWS SigV4, pass config to Rust (Rust handles signing)
  const awsSigV4 = tab.auth.type === 'awssigv4' ? tab.auth.awsSigV4 : undefined

  if (tab.body.type === 'multipart') {
    const fields = (tab.body.fields ?? [])
      .filter((f) => f.enabled && f.key)
      .map((f) => ({ name: f.key, value: f.value }))
    if (isTauri) {
      return makeTauriRequest(tab.method, url, headers, undefined, fields, proxy, awsSigV4)
    }
    // Browser fallback: use FormData
    const fd = new FormData()
    for (const f of fields) fd.append(f.name, f.value)
    return makeFetchRequest(tab.method, url, headers, fd)
  }

  if (isTauri) {
    return makeTauriRequest(tab.method, url, headers, body, undefined, proxy, awsSigV4)
  }
  return makeFetchRequest(tab.method, url, headers, body)
}

async function makeTauriRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  multipartFields?: Array<{ name: string; value: string }>,
  proxy?: ProxyConfig,
  awsSigV4?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string; service: string }
): Promise<ResponseData> {
  const { invoke } = await import('@tauri-apps/api/core')

  const result = await invoke<{
    status: number
    status_text: string
    headers: Record<string, string>
    body: string
    body_encoding: string
    size: number
    time: number
  }>('make_http_request', {
    request: {
      method,
      url,
      headers,
      body: body ?? null,
      multipart_fields: multipartFields ?? null,
      proxy: proxy ?? null,
      aws_sig_v4: awsSigV4 ?? null,
    },
  })

  return {
    status: result.status,
    statusText: result.status_text,
    headers: result.headers,
    body: result.body,
    bodyEncoding: result.body_encoding === 'base64' ? 'base64' : 'utf8',
    size: result.size,
    time: result.time,
    contentType: result.headers['content-type'],
  }
}

function isBinaryContentType(ct: string): boolean {
  const base = ct.split(';')[0].trim().toLowerCase()
  return base.startsWith('image/') || base.startsWith('video/') || base.startsWith('audio/') || base.startsWith('font/')
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function makeFetchRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | FormData | undefined
): Promise<ResponseData> {
  const start = performance.now()

  // Don't pass Content-Type when body is FormData — browser sets it with boundary
  const fetchHeaders = body instanceof FormData
    ? Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type'))
    : headers

  const response = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
  })

  const elapsed = Math.round(performance.now() - start)
  const rawCt = response.headers.get('content-type') ?? ''

  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => { responseHeaders[key] = value })

  let responseBody: string
  let bodyEncoding: 'utf8' | 'base64'
  let size: number

  if (isBinaryContentType(rawCt)) {
    const buffer = await response.arrayBuffer()
    responseBody = arrayBufferToBase64(buffer)
    bodyEncoding = 'base64'
    size = buffer.byteLength
  } else {
    responseBody = await response.text()
    bodyEncoding = 'utf8'
    size = new TextEncoder().encode(responseBody).length
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    bodyEncoding,
    size,
    time: elapsed,
    contentType: rawCt || undefined,
  }
}

export function buildCurlCommand(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const parts: string[] = ['curl']

  if (tab.method !== 'GET') {
    parts.push(`-X ${tab.method}`)
  }

  for (const [key, value] of Object.entries(headers)) {
    parts.push(`-H ${quoteShell(`${key}: ${value}`)}`)
  }

  if (body !== undefined) {
    parts.push(`-d ${quoteShell(body)}`)
  }

  parts.push(quoteShell(url))

  return parts.join(' \\\n  ')
}

function quoteShell(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

export function buildWgetCommand(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const parts: string[] = ['wget']

  if (tab.method !== 'GET') parts.push(`--method=${tab.method}`)

  for (const [key, value] of Object.entries(headers)) {
    parts.push(`--header=${quoteShell(`${key}: ${value}`)}`)
  }

  if (body !== undefined) parts.push(`--body-data=${quoteShell(body)}`)

  parts.push('--output-document=-')
  parts.push(quoteShell(url))

  return parts.join(' \\\n  ')
}

export function buildPythonSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)
  const method = tab.method.toLowerCase()

  const lines: string[] = ['import requests', '']

  const headerEntries = Object.entries(headers)
  const args: string[] = [`    ${JSON.stringify(url)}`]

  if (headerEntries.length > 0) {
    const inner = headerEntries.map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
    args.push(`    headers={\n${inner},\n    }`)
  }

  if (body !== undefined) {
    args.push(`    data=${JSON.stringify(body)}`)
  }

  lines.push(`response = requests.${method}(`)
  lines.push(args.join(',\n') + ',')
  lines.push(')')
  lines.push('')
  lines.push('print(response.status_code)')
  lines.push('print(response.text)')

  return lines.join('\n')
}

export function buildJavaScriptSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const headerEntries = Object.entries(headers)
  const opts: string[] = []

  if (tab.method !== 'GET') opts.push(`  method: ${JSON.stringify(tab.method)}`)

  if (headerEntries.length > 0) {
    const inner = headerEntries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
    opts.push(`  headers: {\n${inner},\n  }`)
  }

  if (body !== undefined) opts.push(`  body: ${JSON.stringify(body)}`)

  const lines: string[] = []

  if (opts.length > 0) {
    lines.push(`const response = await fetch(${JSON.stringify(url)}, {`)
    lines.push(opts.join(',\n') + ',')
    lines.push('});')
  } else {
    lines.push(`const response = await fetch(${JSON.stringify(url)});`)
  }

  lines.push('')
  lines.push('const data = await response.json();')
  lines.push('console.log(data);')

  return lines.join('\n')
}

export function buildGoSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const lines: string[] = [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    body !== undefined ? '\t"strings"' : '',
    ')',
    '',
    'func main() {',
  ].filter((l) => l !== '' || l === '')

  if (body !== undefined) {
    lines.push(`\tbody := strings.NewReader(${JSON.stringify(body)})`)
    lines.push(`\treq, _ := http.NewRequest("${tab.method}", ${JSON.stringify(url)}, body)`)
  } else {
    lines.push(`\treq, _ := http.NewRequest("${tab.method}", ${JSON.stringify(url)}, nil)`)
  }

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
  }

  lines.push('')
  lines.push('\tclient := &http.Client{}')
  lines.push('\tresp, err := client.Do(req)')
  lines.push('\tif err != nil { panic(err) }')
  lines.push('\tdefer resp.Body.Close()')
  lines.push('\tbody2, _ := io.ReadAll(resp.Body)')
  lines.push('\tfmt.Println(resp.Status)')
  lines.push('\tfmt.Println(string(body2))')
  lines.push('}')

  return lines.join('\n')
}

export function buildRubySnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const lines: string[] = [
    'require "net/http"',
    'require "uri"',
    '',
    `uri = URI.parse(${JSON.stringify(url)})`,
    `http = Net::HTTP.new(uri.host, uri.port)`,
    'http.use_ssl = true if uri.scheme == "https"',
    '',
    `request = Net::HTTP::${tab.method.charAt(0) + tab.method.slice(1).toLowerCase()}.new(uri.request_uri)`,
  ]

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`request[${JSON.stringify(k)}] = ${JSON.stringify(v)}`)
  }

  if (body !== undefined) {
    lines.push(`request.body = ${JSON.stringify(body)}`)
  }

  lines.push('')
  lines.push('response = http.request(request)')
  lines.push('puts response.code')
  lines.push('puts response.body')

  return lines.join('\n')
}

export function buildPhpSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const headerLines = Object.entries(headers)
    .map(([k, v]) => `  "${k}: ${v}",`)
    .join('\n')

  const lines: string[] = [
    '<?php',
    '',
    '$curl = curl_init();',
    '',
    'curl_setopt_array($curl, [',
    `  CURLOPT_URL => ${JSON.stringify(url)},`,
    '  CURLOPT_RETURNTRANSFER => true,',
    `  CURLOPT_CUSTOMREQUEST => "${tab.method}",`,
  ]

  if (headerLines) {
    lines.push('  CURLOPT_HTTPHEADER => [')
    lines.push(headerLines)
    lines.push('  ],')
  }

  if (body !== undefined) {
    lines.push(`  CURLOPT_POSTFIELDS => ${JSON.stringify(body)},`)
  }

  lines.push(']);')
  lines.push('')
  lines.push('$response = curl_exec($curl);')
  lines.push('$statusCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);')
  lines.push('curl_close($curl);')
  lines.push('')
  lines.push('echo $statusCode . "\\n";')
  lines.push('echo $response . "\\n";')

  return lines.join('\n')
}

export function buildRustSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const lines: string[] = [
    '// Add to Cargo.toml: reqwest = { version = "0.12", features = ["blocking", "json"] }',
    '',
    'use reqwest::blocking::Client;',
    '',
    'fn main() -> Result<(), Box<dyn std::error::Error>> {',
    '    let client = Client::new();',
    '',
    `    let response = client`,
    `        .${tab.method.toLowerCase()}(${JSON.stringify(url)})`,
  ]

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`        .header(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
  }

  if (body !== undefined) {
    lines.push(`        .body(${JSON.stringify(body)})`)
  }

  lines.push('        .send()?;')
  lines.push('')
  lines.push('    println!("Status: {}", response.status());')
  lines.push('    println!("Body: {}", response.text()?);')
  lines.push('    Ok(())')
  lines.push('}')

  return lines.join('\n')
}

export function buildJavaSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const lines: string[] = [
    '// Requires OkHttp: https://square.github.io/okhttp/',
    'import okhttp3.*;',
    '',
    'OkHttpClient client = new OkHttpClient();',
    '',
  ]

  if (body !== undefined) {
    const ct = headers['Content-Type'] ?? 'text/plain'
    lines.push(`MediaType mediaType = MediaType.parse(${JSON.stringify(ct)});`)
    lines.push(`RequestBody body = RequestBody.create(${JSON.stringify(body)}, mediaType);`)
    lines.push('')
  }

  lines.push('Request request = new Request.Builder()')
  lines.push(`  .url(${JSON.stringify(url)})`)
  lines.push(`  .method(${JSON.stringify(tab.method)}, ${body !== undefined ? 'body' : 'null'})`)

  for (const [k, v] of Object.entries(headers)) {
    lines.push(`  .addHeader(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
  }

  lines.push('  .build();')
  lines.push('')
  lines.push('Response response = client.newCall(request).execute();')
  lines.push('System.out.println(response.code());')
  lines.push('System.out.println(response.body().string());')

  return lines.join('\n')
}

export function buildCsharpSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const lines: string[] = [
    'using System.Net.Http;',
    'using System.Text;',
    '',
    'var client = new HttpClient();',
    `var request = new HttpRequestMessage(HttpMethod.${tab.method.charAt(0) + tab.method.slice(1).toLowerCase()}, ${JSON.stringify(url)});`,
  ]

  for (const [k, v] of Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type')) {
    lines.push(`request.Headers.Add(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
  }

  if (body !== undefined) {
    const ct = headers['Content-Type'] ?? 'text/plain'
    lines.push(`request.Content = new StringContent(${JSON.stringify(body)}, Encoding.UTF8, ${JSON.stringify(ct)});`)
  }

  lines.push('')
  lines.push('var response = await client.SendAsync(request);')
  lines.push('var responseBody = await response.Content.ReadAsStringAsync();')
  lines.push('Console.WriteLine((int)response.StatusCode);')
  lines.push('Console.WriteLine(responseBody);')

  return lines.join('\n')
}

export function buildHttpieSnippet(tab: RequestTab): string {
  const url = buildUrlWithAuth(tab.url, tab.params, tab.auth)
  const headers = buildHeaders(tab.headers, tab.auth, tab.body.type)
  const body = buildBody(tab)

  const parts: string[] = ['http']
  if (tab.method !== 'GET') parts.push(tab.method)
  parts.push(quoteShell(url))

  for (const [k, v] of Object.entries(headers)) {
    parts.push(`${k}:${JSON.stringify(v)}`)
  }

  if (body !== undefined) {
    // HTTPie uses @file or inline JSON/form
    parts.push(`<<<${quoteShell(body)}`)
  }

  return parts.join(' \\\n  ')
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function getStatusColor(status: number): string {
  if (status < 200) return '#61affe'
  if (status < 300) return '#49cc90'
  if (status < 400) return '#fca130'
  return '#f93e3e'
}

export function tryFormatJson(text: string): { formatted: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(text)
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true }
  } catch {
    return { formatted: text, isJson: false }
  }
}
