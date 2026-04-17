import { useState, useRef, useEffect } from 'react'
import type { RequestTab } from '../types'
import { useStore } from '../store/useStore'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { Copy, Trash2, ArrowUp, ArrowDown, Wifi, WifiOff } from 'lucide-react'

interface Props {
  tab: RequestTab
}

export function WsPanel({ tab }: Props) {
  const { connectWs, disconnectWs, sendWsMessage, updateTab } = useStore()
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const status = tab.wsStatus ?? 'idle'
  const messages = tab.wsMessages ?? []
  const isOpen = status === 'open'
  const isConnecting = status === 'connecting'

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, autoScroll])

  const handleConnect = () => {
    connectWs(tab.id)
  }

  const handleDisconnect = () => {
    disconnectWs(tab.id)
  }

  const handleSend = () => {
    if (!message.trim() || !isOpen) return
    sendWsMessage(tab.id, message)
    setMessage('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSend()
    }
  }

  const filteredMessages = filter
    ? messages.filter((m) => m.data.toLowerCase().includes(filter.toLowerCase()))
    : messages

  const statusColor =
    status === 'open' ? 'text-green-400' :
    status === 'connecting' ? 'text-amber-400' :
    status === 'error' ? 'text-red-400' :
    'text-muted-foreground'

  const statusLabel =
    status === 'open' ? 'Connected' :
    status === 'connecting' ? 'Connecting…' :
    status === 'error' ? 'Error' :
    status === 'closed' ? 'Disconnected' :
    'Idle'

  return (
    <div className="flex flex-col h-full">
      {/* URL bar + connect button */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold text-amber-400 w-8">WS</span>
        </div>
        <Input
          value={tab.url}
          onChange={(e) => updateTab(tab.id, { url: e.target.value })}
          placeholder="ws://localhost:8080/ws  or  wss://echo.websocket.org"
          className="flex-1 font-mono text-sm h-8"
          disabled={isOpen || isConnecting}
        />
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-xs', statusColor)}>{statusLabel}</span>
          {isOpen || isConnecting ? (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={handleDisconnect}>
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleConnect}
              disabled={!tab.url.trim()}
            >
              <Wifi className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Connect</span>
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {status === 'error' && tab.error && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs shrink-0">
          {tab.error}
        </div>
      )}

      {/* Message log */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 flex flex-col">
          {/* Filter bar */}
          <div className="px-3 py-1.5 border-b border-border/50 shrink-0 flex items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter messages…"
              className="h-6 text-xs flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => useStore.getState().updateTab(tab.id, { wsMessages: [] })}
              title="Clear messages"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <button
              className={cn('text-[10px] px-1.5 py-0.5 rounded', autoScroll ? 'text-primary' : 'text-muted-foreground')}
              onClick={() => setAutoScroll((v) => !v)}
              title="Auto-scroll"
            >
              ↓
            </button>
          </div>

          <ScrollArea className="flex-1">
            {filteredMessages.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground/40 text-xs">
                {status === 'open' ? 'No messages yet' : 'Connect to start receiving messages'}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredMessages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Message composer */}
      <div className="border-t border-border shrink-0 p-2">
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isOpen ? 'Message… (⌘↵ to send)' : 'Connect first to send messages'}
            disabled={!isOpen}
            className="flex-1 min-h-[60px] max-h-[120px] resize-none font-mono text-xs"
          />
          <Button
            size="sm"
            className="h-auto self-end"
            disabled={!isOpen || !message.trim()}
            onClick={handleSend}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

function MessageRow({ msg }: { msg: { id: string; direction: 'sent' | 'received'; data: string; ts: number } }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(msg.data).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const time = new Date(msg.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Pretty-print JSON if possible
  let displayData = msg.data
  try {
    const parsed = JSON.parse(msg.data)
    displayData = JSON.stringify(parsed, null, 2)
  } catch { /* leave as-is */ }

  return (
    <div
      className={cn(
        'group flex gap-2 rounded px-2 py-1.5 text-xs',
        msg.direction === 'sent' ? 'bg-primary/5' : 'bg-muted/30'
      )}
    >
      <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
        {msg.direction === 'sent' ? (
          <ArrowUp className="h-3 w-3 text-primary" />
        ) : (
          <ArrowDown className="h-3 w-3 text-green-400" />
        )}
        <span className="text-[9px] text-muted-foreground/60">{time}</span>
      </div>
      <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/90">
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
