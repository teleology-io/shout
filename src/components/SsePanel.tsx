import { useState, useRef, useEffect } from 'react'
import type { RequestTab, SseEvent } from '../types'
import { useStore } from '../store/useStore'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '@/lib/utils'
import { Copy, Trash2, Radio } from 'lucide-react'

interface Props {
  tab: RequestTab
}

export function SsePanel({ tab }: Props) {
  const { connectSse, disconnectSse, updateTab } = useStore()
  const [textFilter, setTextFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const status = tab.sseStatus ?? 'idle'
  const events = tab.sseEvents ?? []
  const isOpen = status === 'open' || status === 'connecting'

  // Collect unique event types
  const eventTypes = Array.from(new Set(events.map((e) => e.eventType)))

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events.length, autoScroll])

  const filtered = events.filter((e) => {
    if (typeFilter !== 'all' && e.eventType !== typeFilter) return false
    if (textFilter && !e.data.toLowerCase().includes(textFilter.toLowerCase())) return false
    return true
  })

  const statusColor =
    status === 'open' ? 'text-green-400' :
    status === 'connecting' ? 'text-amber-400' :
    status === 'error' ? 'text-red-400' :
    'text-muted-foreground'

  const statusLabel =
    status === 'open' ? 'Streaming' :
    status === 'connecting' ? 'Connecting…' :
    status === 'error' ? 'Error' :
    status === 'closed' ? 'Closed' :
    'Idle'

  return (
    <div className="flex flex-col h-full">
      {/* URL + controls */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold text-green-400 w-8">SSE</span>
        </div>
        <Input
          value={tab.url}
          onChange={(e) => updateTab(tab.id, { url: e.target.value })}
          placeholder="https://api.example.com/events"
          className="flex-1 min-w-[200px] font-mono text-sm h-8"
          disabled={isOpen}
        />
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-xs', statusColor)}>{statusLabel}</span>
          {isOpen ? (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={() => disconnectSse(tab.id)}>
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => connectSse(tab.id)}
              disabled={!tab.url.trim()}
            >
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Connect</span>
            </Button>
          )}
        </div>
      </div>

      {status === 'error' && tab.error && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs shrink-0">
          {tab.error}
        </div>
      )}

      {/* Filter bar */}
      <div className="px-3 py-1.5 border-b border-border/50 shrink-0 flex items-center gap-2">
        <Input
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          placeholder="Filter data…"
          className="h-6 text-xs flex-1"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-6 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All types</SelectItem>
            {eventTypes.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => updateTab(tab.id, { sseEvents: [] })}
          title="Clear events"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <button
          className={cn('text-[10px] px-1.5 py-0.5 rounded border border-border', autoScroll ? 'text-primary' : 'text-muted-foreground')}
          onClick={() => setAutoScroll((v) => !v)}
        >
          ↓
        </button>
      </div>

      {/* Events log */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground/40 text-xs">
            {isOpen ? 'Waiting for events…' : 'Connect to start receiving events'}
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filtered.map((ev, i) => (
              <SseEventRow key={i} event={ev} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Stats footer */}
      {events.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border shrink-0 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{events.length} events received</span>
          {typeFilter !== 'all' && <span>{filtered.length} shown</span>}
        </div>
      )}
    </div>
  )
}

function SseEventRow({ event }: { event: SseEvent }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(event.data).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const time = new Date(event.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  let displayData = event.data
  try {
    displayData = JSON.stringify(JSON.parse(event.data), null, 2)
  } catch { /* leave as-is */ }

  const typeColor =
    event.eventType === 'message' ? 'bg-muted text-muted-foreground' :
    event.eventType === 'error' ? 'bg-red-500/15 text-red-400' :
    'bg-primary/15 text-primary'

  return (
    <div className="group flex gap-2 px-3 py-2 hover:bg-accent/20 text-xs">
      <div className="shrink-0 flex flex-col gap-0.5 pt-0.5">
        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', typeColor)}>
          {event.eventType}
        </span>
        <span className="text-[9px] text-muted-foreground/60">{time}</span>
        {event.id && (
          <span className="text-[9px] text-muted-foreground/40">#{event.id}</span>
        )}
      </div>
      <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/90 min-w-0">
        {displayData}
      </pre>
      <button
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copy}
        title="Copy"
      >
        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        {copied && <span className="text-[9px] text-green-400 ml-1">✓</span>}
      </button>
    </div>
  )
}
