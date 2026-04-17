import { useState, useEffect, useRef } from 'react'
import type { ResponseData, RequestTab, HistoricResponse } from '../types'
import { formatSize, formatTime, getStatusColor, tryFormatJson } from '../utils/http'
import { useStore } from '../store/useStore'
import { formatXml, looksLikeXml, tokenizeXml, XML_TOKEN_COLORS } from '../utils/xmlFormat'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Loader2, Copy, WrapText, Code2, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tokenizeJson, TOKEN_COLORS } from '../utils/jsonHighlight'

interface Props {
  response?: ResponseData
  isLoading?: boolean
  error?: string
  tab?: RequestTab
}

export function ResponsePanel({ response, isLoading, error, tab }: Props) {
  const [rawView, setRawView] = useState(false)
  const [wordWrap, setWordWrap] = useState(true)
  const [viewingHistory, setViewingHistory] = useState<HistoricResponse | null>(null)

  // Resolve history from the saved request
  const { collections, savedRequests, clearResponseHistory } = useStore()
  const activeCollection = tab?.collectionId ? collections.find((c) => c.id === tab.collectionId) : undefined
  const savedRequest = tab?.savedRequestId
    ? (collections.flatMap((c) => [...c.requests, ...(c.groups ?? []).flatMap((g) => g.requests)])
        .find((r) => r.id === tab.savedRequestId) ??
       savedRequests.find((r) => r.id === tab.savedRequestId))
    : undefined
  const responseHistory = savedRequest?.responseHistory ?? []

  // Show historic response if selected
  const displayedResponse = viewingHistory ?? response

  if (isLoading && tab?.streamMode) {
    return <StreamingView tab={tab} />
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-card border-t border-border">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Sending request…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 bg-card border-t border-border">
        <p className="text-destructive text-sm font-semibold">Request Failed</p>
        <p className="text-muted-foreground text-xs text-center max-w-lg font-mono break-all bg-muted/40 px-4 py-3 rounded-md">
          {error}
        </p>
      </div>
    )
  }

  if (!displayedResponse && responseHistory.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-card border-t border-border">
        <div className="text-5xl opacity-[0.06] select-none">→</div>
        <p className="text-muted-foreground/50 text-sm">Hit Send to see the response</p>
      </div>
    )
  }

  if (!displayedResponse) {
    // Have history but no current response — show history tab immediately
    return (
      <div className="flex flex-col bg-card border-t border-border flex-1 min-h-0">
        <Tabs defaultValue="history" className="flex flex-col flex-1 min-h-0">
          <TabsList className="shrink-0 h-9 bg-card/50">
            <TabsTrigger value="history" className="text-xs">History ({responseHistory.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="flex-1 min-h-0 mt-0">
            <HistoryTab history={responseHistory} onSelect={setViewingHistory} selected={null} onClear={() => savedRequest && clearResponseHistory(savedRequest.id)} />
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  const { formatted: jsonFormatted, isJson } = tryFormatJson(displayedResponse.body)
  const isBinary = displayedResponse.bodyEncoding === 'base64' && !isImageContent(displayedResponse.contentType)
  const isXml = !isJson && !isBinary && looksLikeXml(displayedResponse.body)
  const formattedXml = isXml ? formatXml(displayedResponse.body) : ''
  const displayBody = rawView ? displayedResponse.body : (isJson ? jsonFormatted : isXml ? formattedXml : displayedResponse.body)
  const headerEntries = Object.entries(displayedResponse.headers)
  const statusColor = getStatusColor(displayedResponse.status)
  const setCookieHeader = displayedResponse.headers['set-cookie'] ?? displayedResponse.headers['Set-Cookie']
  const newCookies = setCookieHeader ? setCookieHeader.split('\n').filter(Boolean) : []
  const jarCookies = activeCollection?.cookieJar?.cookies ?? []
  const showCookiesTab = newCookies.length > 0 || jarCookies.length > 0

  return (
    <div className="flex flex-col bg-card border-t border-border flex-1 min-h-0">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-md"
          style={{ color: statusColor, backgroundColor: `${statusColor}18` }}
        >
          {displayedResponse.status} {displayedResponse.statusText}
        </span>
        <span className="text-muted-foreground text-xs">{formatTime(displayedResponse.time)}</span>
        <span className="text-muted-foreground text-xs">{formatSize(displayedResponse.size)}</span>
        {tab?.streamComplete && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md flex items-center gap-1">
            <Zap className="h-3 w-3" /> Streamed
          </span>
        )}
        {viewingHistory && (
          <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md">Viewing historical response</span>
        )}

        <div className="ml-auto flex gap-1">
          {(isJson || isXml) && (
            <Button
              variant={rawView ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setRawView(!rawView)}
              title="Raw view"
            >
              <Code2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant={wordWrap ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setWordWrap(!wordWrap)}
            title="Word wrap"
          >
            <WrapText className="h-3.5 w-3.5" />
          </Button>
          {viewingHistory && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setViewingHistory(null)}>
              Back to current
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => navigator.clipboard.writeText(displayedResponse.body)}
            title="Copy response"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="body" className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 h-9 bg-card/50">
          <TabsTrigger value="body" className="text-xs">Body</TabsTrigger>
          <TabsTrigger value="headers" className="text-xs">
            Headers
            <span className="ml-1 text-muted-foreground">({headerEntries.length})</span>
          </TabsTrigger>
          {isPreviewable(displayedResponse.contentType) && (
            <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
          )}
          {showCookiesTab && (
            <TabsTrigger value="cookies" className="text-xs">
              Cookies
              {jarCookies.length > 0 && <span className="ml-1 text-muted-foreground">({jarCookies.length})</span>}
            </TabsTrigger>
          )}
          {tab?.savedRequestId && (
            <TabsTrigger value="history" className="text-xs">
              History{responseHistory.length > 0 && <span className="ml-1 text-muted-foreground">({responseHistory.length})</span>}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="body" className="flex-1 min-h-0 mt-0">
          {isBinary ? (
            <BinaryBody body={displayedResponse.body} contentType={displayedResponse.contentType ?? ''} size={displayedResponse.size} />
          ) : (
            <ScrollArea className="h-full">
              <pre
                className={cn(
                  'p-4 text-sm font-mono text-foreground leading-relaxed',
                  wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                )}
              >
                {isJson && !rawView ? (
                  <JsonHighlight text={displayBody} />
                ) : isXml && !rawView ? (
                  <XmlHighlight text={formattedXml} />
                ) : displayBody ? (
                  displayBody
                ) : (
                  <span className="text-muted-foreground/40 italic">Empty body</span>
                )}
              </pre>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="headers" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/3">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {headerEntries.map(([key, value]) => (
                  <tr key={key} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="px-4 py-2 font-mono text-blue-400">{key}</td>
                    <td className="px-4 py-2 font-mono text-foreground/80 break-all">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </TabsContent>

        {isPreviewable(displayedResponse.contentType) && (
          <TabsContent value="preview" className="flex-1 min-h-0 mt-0 overflow-hidden">
            <PreviewContent
              body={displayedResponse.body}
              bodyEncoding={displayedResponse.bodyEncoding}
              contentType={displayedResponse.contentType ?? ''}
            />
          </TabsContent>
        )}
        {showCookiesTab && (
          <TabsContent value="cookies" className="flex-1 min-h-0 mt-0">
            <ResponseCookiesTab newCookies={newCookies} jarCookies={jarCookies} collectionName={activeCollection?.name} />
          </TabsContent>
        )}
        {tab?.savedRequestId && (
          <TabsContent value="history" className="flex-1 min-h-0 mt-0">
            <HistoryTab
              history={responseHistory}
              selected={viewingHistory}
              onSelect={setViewingHistory}
              onClear={() => savedRequest && clearResponseHistory(savedRequest.id)}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// ── Streaming view ────────────────────────────────────────────────────────────

function StreamingView({ tab }: { tab: RequestTab }) {
  const { cancelStream } = useStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const chunks = tab.streamChunks ?? []
  const combined = chunks.join('')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chunks.length])

  const { formatted, isJson } = tryFormatJson(combined)

  return (
    <div className="flex-1 flex flex-col bg-card border-t border-border min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <Zap className="h-3.5 w-3.5 animate-pulse" />
          Streaming…
        </span>
        <span className="text-xs text-muted-foreground">{combined.length} bytes received</span>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs gap-1.5 ml-auto"
          onClick={() => cancelStream(tab.id)}
        >
          <X className="h-3 w-3" /> Cancel
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <pre className="p-4 text-sm font-mono text-foreground/90 whitespace-pre-wrap break-all leading-relaxed">
          {isJson ? <JsonHighlight text={formatted} /> : combined || <span className="text-muted-foreground/40 italic">Waiting for data…</span>}
          <div ref={bottomRef} />
        </pre>
      </ScrollArea>
    </div>
  )
}

// ── Response cookies tab ──────────────────────────────────────────────────────

import type { Cookie } from '../types'

function ResponseCookiesTab({
  newCookies,
  jarCookies,
  collectionName,
}: {
  newCookies: string[]
  jarCookies: Cookie[]
  collectionName?: string
}) {
  const now = Math.floor(Date.now() / 1000)

  return (
    <ScrollArea className="h-full">
      {/* Set-Cookie headers from this response */}
      {newCookies.length > 0 && (
        <div className="border-b border-border/50">
          <div className="px-4 py-1.5 bg-muted/20 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Set by this response
          </div>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {newCookies.map((raw, i) => {
                const [nameValue, ...attrs] = raw.split(';').map((s) => s.trim())
                const [name, ...valueParts] = nameValue.split('=')
                const value = valueParts.join('=')
                return (
                  <tr key={i} className="border-b border-border/20 hover:bg-accent/30">
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          <span className="font-mono text-green-400">{name}</span>
                          <span className="text-muted-foreground/60">=</span>
                          <span className="font-mono text-foreground/80 break-all">{value}</span>
                        </span>
                        {attrs.map((a, j) => (
                          <span key={j} className="text-muted-foreground/50 font-mono text-[10px]">{a}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Collection cookie jar */}
      {jarCookies.length > 0 && (
        <div>
          <div className="px-4 py-1.5 bg-muted/20 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            {collectionName ? `${collectionName} — cookie jar` : 'Cookie jar'}
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-1.5 text-left font-medium text-muted-foreground w-1/4">Name</th>
                <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">Value</th>
                <th className="px-4 py-1.5 text-left font-medium text-muted-foreground w-[100px]">Domain</th>
                <th className="px-4 py-1.5 text-left font-medium text-muted-foreground w-[80px]">Expires</th>
              </tr>
            </thead>
            <tbody>
              {jarCookies.map((cookie) => {
                const expired = cookie.expires ? cookie.expires < now : false
                return (
                  <tr key={cookie.id} className="border-b border-border/20 hover:bg-accent/30">
                    <td className="px-4 py-1.5 font-mono text-blue-400 truncate max-w-0">{cookie.name || <em className="text-muted-foreground/40">unnamed</em>}</td>
                    <td className="px-4 py-1.5 font-mono text-foreground/80 truncate max-w-0 break-all">{cookie.value || '—'}</td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground/60 truncate">{cookie.domain || '—'}</td>
                    <td className="px-4 py-1.5">
                      {cookie.expires ? (
                        <span className={expired ? 'text-destructive' : 'text-muted-foreground'}>
                          {expired ? 'Expired' : new Date(cookie.expires * 1000).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">Session</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {newCookies.length === 0 && jarCookies.length === 0 && (
        <div className="flex items-center justify-center h-24 text-muted-foreground/40 text-xs">
          No cookies
        </div>
      )}
    </ScrollArea>
  )
}

// ── Preview helpers ───────────────────────────────────────────────────────────

function isPreviewable(contentType?: string): boolean {
  if (!contentType) return false
  const ct = contentType.split(';')[0].trim().toLowerCase()
  return ct.startsWith('image/') || ct.startsWith('video/') || ct.startsWith('audio/') || ct === 'text/html'
}

interface PreviewProps {
  body: string
  bodyEncoding?: 'utf8' | 'base64'
  contentType: string
}

function PreviewContent({ body, contentType }: PreviewProps) {
  const ct = contentType.split(';')[0].trim().toLowerCase()

  if (ct.startsWith('image/')) {
    const src = `data:${ct};base64,${body}`
    return (
      <div className="flex items-center justify-center h-full p-4 overflow-auto">
        <img src={src} alt="Response" className="max-w-full max-h-full object-contain rounded" />
      </div>
    )
  }

  if (ct.startsWith('video/')) {
    const src = `data:${ct};base64,${body}`
    return (
      <div className="flex items-center justify-center h-full p-4">
        <video controls className="max-w-full max-h-full rounded">
          <source src={src} type={ct} />
        </video>
      </div>
    )
  }

  if (ct.startsWith('audio/')) {
    const src = `data:${ct};base64,${body}`
    return (
      <div className="flex items-center justify-center h-full p-4">
        <audio controls src={src} className="w-full max-w-lg" />
      </div>
    )
  }

  if (ct === 'text/html') {
    return (
      <iframe
        srcDoc={body}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 w-full h-full border-0 bg-white"
        title="Response preview"
      />
    )
  }

  return <div className="p-4 text-muted-foreground text-sm">No preview available for this content type.</div>
}

function isImageContent(ct?: string): boolean {
  return !!ct && ct.split(';')[0].trim().toLowerCase().startsWith('image/')
}

// ── JSON syntax highlighter ───────────────────────────────────────────────────

function JsonHighlight({ text }: { text: string }) {
  return <>{tokenizeJson(text).map((t, i) => <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>{t.value}</span>)}</>
}

// ── XML syntax highlighter ────────────────────────────────────────────────────

function XmlHighlight({ text }: { text: string }) {
  return <>{tokenizeXml(text).map((t, i) => <span key={i} style={{ color: XML_TOKEN_COLORS[t.type] }}>{t.value}</span>)}</>
}

// ── Binary body viewer ────────────────────────────────────────────────────────

function BinaryBody({ body, contentType, size }: { body: string; contentType: string; size: number }) {
  const [showHex, setShowHex] = useState(false)

  // Decode first 256 bytes for hex dump
  const hexDump = showHex ? buildHexDump(body, 256) : null

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Binary response</span>
          {' · '}{formatSize(size)}
          {contentType && <> · <span className="font-mono text-xs">{contentType.split(';')[0]}</span></>}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs ml-auto"
          onClick={() => setShowHex((v) => !v)}
        >
          {showHex ? 'Hide' : 'Show'} Hex Dump
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const a = document.createElement('a')
            a.href = `data:${contentType};base64,${body}`
            a.download = 'response'
            a.click()
          }}
        >
          Download
        </Button>
      </div>
      {showHex && hexDump && (
        <ScrollArea className="flex-1 border border-border rounded-md">
          <pre className="p-3 text-xs font-mono text-foreground/70 leading-relaxed whitespace-pre">
            {hexDump}
          </pre>
        </ScrollArea>
      )}
    </div>
  )
}

// ── History tab ───────────────────────────────────────────────────────────────

interface HistoryTabProps {
  history: HistoricResponse[]
  selected: HistoricResponse | null
  onSelect: (r: HistoricResponse | null) => void
  onClear: () => void
}

function HistoryTab({ history, selected, onSelect, onClear }: HistoryTabProps) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
        No history yet — responses will appear here after sending
      </div>
    )
  }

  const sorted = [...history].reverse()

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">When</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Size</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const color = getStatusColor(entry.status)
              const isSelected = selected?.id === entry.id
              return (
                <tr
                  key={entry.id}
                  onClick={() => onSelect(isSelected ? null : entry)}
                  className={cn(
                    'border-b border-border/50 cursor-pointer transition-colors',
                    isSelected ? 'bg-primary/10' : 'hover:bg-accent/30'
                  )}
                >
                  <td className="px-4 py-2 text-muted-foreground">{relativeTime(entry.sentAt)}</td>
                  <td className="px-4 py-2">
                    <span className="font-bold px-1.5 py-0.5 rounded text-[10px]" style={{ color, backgroundColor: `${color}18` }}>
                      {entry.status} {entry.statusText}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{formatTime(entry.time)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatSize(entry.size)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollArea>
      <div className="border-t border-border p-2 flex justify-end">
        <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive/70 hover:text-destructive" onClick={onClear}>
          Clear History
        </Button>
      </div>
    </div>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function buildHexDump(base64: string, maxBytes: number): string {
  try {
    const binary = atob(base64)
    const bytes = Math.min(binary.length, maxBytes)
    const lines: string[] = []
    for (let offset = 0; offset < bytes; offset += 16) {
      const chunk = binary.slice(offset, offset + 16)
      const hex = Array.from(chunk).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
      const ascii = Array.from(chunk).map((c) => {
        const code = c.charCodeAt(0)
        return code >= 32 && code < 127 ? c : '.'
      }).join('')
      lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  |${ascii}|`)
    }
    if (binary.length > maxBytes) {
      lines.push(`... ${binary.length - maxBytes} more bytes`)
    }
    return lines.join('\n')
  } catch {
    return 'Unable to decode binary data'
  }
}
