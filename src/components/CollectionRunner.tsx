import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import type { Collection, SavedRequest, ResponseData } from '../types'
import { makeRequest } from '../utils/http'
import { formatSize, formatTime, getStatusColor } from '../utils/http'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Checkbox } from './ui/checkbox'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Loader2, Play, Square, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunnerResult {
  requestId: string
  requestName: string
  method: string
  url: string
  status?: number
  statusText?: string
  time?: number
  size?: number
  passed: boolean
  error?: string
}

interface Props {
  collection: Collection
  open: boolean
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CollectionRunner({ collection, open, onClose }: Props) {
  const { collections } = useStore()
  // Use fresh collection from store
  const col = collections.find((c) => c.id === collection.id) ?? collection

  // Flatten all requests in order: root, then groups
  const allRequests: SavedRequest[] = [
    ...col.requests,
    ...(col.groups ?? []).flatMap((g) => [...g.requests, ...(g.groups ?? []).flatMap((sg) => sg.requests)]),
  ]

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(allRequests.map((r) => r.id)))
  const [delayMs, setDelayMs] = useState(200)
  const [stopOnFailure, setStopOnFailure] = useState(false)
  const [results, setResults] = useState<RunnerResult[]>([])
  const [running, setRunning] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const abortRef = useRef(false)

  const toRun = allRequests.filter((r) => selectedIds.has(r.id))
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const totalTime = results.reduce((sum, r) => sum + (r.time ?? 0), 0)

  const handleRun = async () => {
    abortRef.current = false
    setResults([])
    setRunning(true)

    const env = col.environments?.find((e) => e.id === col.activeEnvironmentId)
    const vars: Record<string, string> = {}
    for (const v of env?.variables ?? []) {
      if (v.enabled && v.key) vars[v.key] = v.value
    }

    for (const req of toRun) {
      if (abortRef.current) break

      setCurrentId(req.id)
      let result: RunnerResult

      try {
        const resolved = resolveVars(req, vars)
        const response: ResponseData = await makeRequest({ ...resolved, id: '', name: '', isDirty: false, isLoading: false } as never)
        const passed = response.status >= 200 && response.status < 300
        result = {
          requestId: req.id,
          requestName: req.name,
          method: req.method,
          url: req.url,
          status: response.status,
          statusText: response.statusText,
          time: response.time,
          size: response.size,
          passed,
        }
        if (!passed && stopOnFailure) {
          setResults((prev) => [...prev, result])
          break
        }
      } catch (err) {
        result = {
          requestId: req.id,
          requestName: req.name,
          method: req.method,
          url: req.url,
          passed: false,
          error: String(err),
        }
        if (stopOnFailure) {
          setResults((prev) => [...prev, result])
          break
        }
      }

      setResults((prev) => [...prev, result])

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    setCurrentId(null)
    setRunning(false)
  }

  const handleStop = () => { abortRef.current = true }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `runner-${col.name}-${Date.now()}.json`
    a.click()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === allRequests.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allRequests.map((r) => r.id)))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden max-h-[80vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">Run Collection — {col.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: request selector */}
          <div className="w-56 border-r border-border flex flex-col shrink-0">
            <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
              <Checkbox
                checked={selectedIds.size === allRequests.length}
                onCheckedChange={toggleAll}
                id="select-all"
              />
              <Label htmlFor="select-all" className="text-xs cursor-pointer">
                All ({allRequests.length})
              </Label>
            </div>
            <ScrollArea className="flex-1">
              {allRequests.map((req) => {
                const result = results.find((r) => r.requestId === req.id)
                const isCurrent = currentId === req.id
                return (
                  <div
                    key={req.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border/30',
                      isCurrent && 'bg-primary/10'
                    )}
                  >
                    <Checkbox
                      checked={selectedIds.has(req.id)}
                      onCheckedChange={() => toggleSelect(req.id)}
                      disabled={running}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="truncate block text-foreground/80">{req.name}</span>
                    </div>
                    {isCurrent && <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />}
                    {result && (
                      <span className={cn('w-2 h-2 rounded-full shrink-0', result.passed ? 'bg-green-500' : 'bg-red-500')} />
                    )}
                  </div>
                )
              })}
            </ScrollArea>
          </div>

          {/* Right: results + controls */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Controls */}
            <div className="px-4 py-2 border-b border-border shrink-0 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Delay</Label>
                <Input
                  type="number"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  className="h-6 w-16 text-xs"
                  min={0}
                  max={5000}
                  disabled={running}
                />
                <span className="text-xs text-muted-foreground">ms</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  checked={stopOnFailure}
                  onCheckedChange={(v) => setStopOnFailure(!!v)}
                  id="stop-on-fail"
                  disabled={running}
                />
                <Label htmlFor="stop-on-fail" className="text-xs cursor-pointer">Stop on failure</Label>
              </div>
              <div className="ml-auto flex gap-1.5">
                {results.length > 0 && !running && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExport}>
                    <Download className="h-3 w-3" /> Export
                  </Button>
                )}
                {running ? (
                  <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={handleStop}>
                    <Square className="h-3 w-3" /> Stop
                  </Button>
                ) : (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleRun} disabled={toRun.length === 0}>
                    <Play className="h-3 w-3" /> Run ({toRun.length})
                  </Button>
                )}
              </div>
            </div>

            {/* Results */}
            <ScrollArea className="flex-1">
              {results.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-sm">
                  {running ? 'Running…' : 'Press Run to start'}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[40%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Request</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Size</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => {
                          const color = r.status ? getStatusColor(r.status) : '#888'
                          return (
                            <tr key={r.requestId} className="border-b border-border/50 hover:bg-accent/20">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-bold text-[10px] shrink-0" style={{ color: getStatusColor(200) }}>{r.method}</span>
                                  <span className="truncate text-foreground/80">{r.requestName}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 min-w-0">
                                {r.status ? (
                                  <span className="font-bold px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap" style={{ color, backgroundColor: `${color}18` }}>
                                    {r.status} {r.statusText}
                                  </span>
                                ) : (
                                  <span className="text-destructive text-[10px] truncate block" title={r.error}>{r.error ?? 'Error'}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.time != null ? formatTime(r.time) : '—'}</td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.size != null ? formatSize(r.size) : '—'}</td>
                              <td className="px-3 py-2">
                                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', r.passed ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400')}>
                                  {r.passed ? 'PASS' : 'FAIL'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Summary */}
                  {!running && (
                    <div className="px-3 py-3 border-t border-border flex items-center gap-4 text-xs">
                      <span className="text-green-400 font-medium">{passed} passed</span>
                      <span className="text-red-400 font-medium">{failed} failed</span>
                      <span className="text-muted-foreground">{formatTime(totalTime)} total</span>
                    </div>
                  )}
                </>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveVars(req: SavedRequest, vars: Record<string, string>): SavedRequest {
  const resolve = (s: string) => s.replace(/\{\{([\w.-]+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
  return {
    ...req,
    url: resolve(req.url),
    headers: req.headers.map((h) => ({ ...h, value: resolve(h.value) })),
    params: req.params.map((p) => ({ ...p, value: resolve(p.value) })),
    body: { ...req.body, content: resolve(req.body.content) },
  }
}
