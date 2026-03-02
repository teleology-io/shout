import { useState } from 'react'
import type { ResponseData } from '../types'
import { formatSize, formatTime, getStatusColor, tryFormatJson } from '../utils/http'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Loader2, Copy, WrapText, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tokenizeJson, TOKEN_COLORS } from '../utils/jsonHighlight'

interface Props {
  response?: ResponseData
  isLoading?: boolean
  error?: string
}

export function ResponsePanel({ response, isLoading, error }: Props) {
  const [rawView, setRawView] = useState(false)
  const [wordWrap, setWordWrap] = useState(true)

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

  if (!response) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-card border-t border-border">
        <div className="text-5xl opacity-[0.06] select-none">→</div>
        <p className="text-muted-foreground/50 text-sm">Hit Send to see the response</p>
      </div>
    )
  }

  const { formatted, isJson } = tryFormatJson(response.body)
  const displayBody = rawView ? response.body : formatted
  const headerEntries = Object.entries(response.headers)
  const statusColor = getStatusColor(response.status)

  return (
    <div className="flex flex-col bg-card border-t border-border flex-1 min-h-0">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-md"
          style={{ color: statusColor, backgroundColor: `${statusColor}18` }}
        >
          {response.status} {response.statusText}
        </span>
        <span className="text-muted-foreground text-xs">{formatTime(response.time)}</span>
        <span className="text-muted-foreground text-xs">{formatSize(response.size)}</span>

        <div className="ml-auto flex gap-1">
          {isJson && (
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => navigator.clipboard.writeText(response.body)}
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
          {isPreviewable(response.contentType) && (
            <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="body" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <pre
              className={cn(
                'p-4 text-sm font-mono text-foreground leading-relaxed',
                wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
              )}
            >
              {isJson && !rawView ? (
                <JsonHighlight text={displayBody} />
              ) : displayBody ? (
                displayBody
              ) : (
                <span className="text-muted-foreground/40 italic">Empty body</span>
              )}
            </pre>
          </ScrollArea>
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

        {isPreviewable(response.contentType) && (
          <TabsContent value="preview" className="flex-1 min-h-0 mt-0 overflow-hidden">
            <PreviewContent
              body={response.body}
              bodyEncoding={response.bodyEncoding}
              contentType={response.contentType ?? ''}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
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

// ── JSON syntax highlighter ───────────────────────────────────────────────────

function JsonHighlight({ text }: { text: string }) {
  return <>{tokenizeJson(text).map((t, i) => <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>{t.value}</span>)}</>
}
