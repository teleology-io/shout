import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../store/useStore'
import type { SavedRequest } from '../types'
import { METHOD_COLORS } from '../types'
import { fuzzy, fuzzyScore } from '../utils/fuzzy'
import { Dialog, DialogContent } from './ui/dialog'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Search, Plus, Upload, Settings, Zap, File, Folder, Layout,
} from 'lucide-react'

// ── Item types ───────────────────────────────────────────────────────────────

type PaletteItemKind = 'request' | 'tab' | 'action' | 'collection'

interface PaletteItem {
  id: string
  kind: PaletteItemKind
  label: string
  sublabel?: string
  method?: string
  action: () => void
}

interface Props {
  open: boolean
  onClose: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: Props) {
  const { collections, savedRequests, tabs, activeTabId, openTab, openSavedRequest, setActiveTab } = useStore()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Build item list
  const items = useMemo<PaletteItem[]>(() => {
    const result: PaletteItem[] = []

    // Static actions
    result.push({
      id: 'action:new-tab',
      kind: 'action',
      label: 'New Request',
      sublabel: 'Open a new empty tab',
      action: () => { openTab(); onClose() },
    })
    result.push({
      id: 'action:import',
      kind: 'action',
      label: 'Import OpenAPI',
      sublabel: 'Import from file, URL or paste',
      action: () => { window.dispatchEvent(new CustomEvent('shout:open-import')); onClose() },
    })
    result.push({
      id: 'action:env',
      kind: 'action',
      label: 'Edit Environments',
      sublabel: 'Manage collection variables',
      action: () => { window.dispatchEvent(new CustomEvent('shout:open-environments')); onClose() },
    })
    result.push({
      id: 'action:theme',
      kind: 'action',
      label: 'Change Theme',
      sublabel: 'Switch between 8 themes',
      action: () => { window.dispatchEvent(new CustomEvent('shout:open-settings', { detail: { tab: 'theme' } })); onClose() },
    })
    result.push({
      id: 'action:shortcuts',
      kind: 'action',
      label: 'Keyboard Shortcuts',
      sublabel: 'View all keyboard shortcuts',
      action: () => { window.dispatchEvent(new CustomEvent('shout:open-shortcuts')); onClose() },
    })

    // Open tabs
    for (const tab of tabs) {
      result.push({
        id: `tab:${tab.id}`,
        kind: 'tab',
        label: tab.name,
        sublabel: tab.url || 'No URL',
        method: tab.method,
        action: () => { setActiveTab(tab.id); onClose() },
      })
    }

    // Saved requests from collections
    for (const col of collections) {
      for (const req of col.requests) {
        result.push(requestItem(req, col.name, openSavedRequest, onClose))
      }
      for (const group of col.groups ?? []) {
        for (const req of group.requests) {
          result.push(requestItem(req, `${col.name} / ${group.name}`, openSavedRequest, onClose))
        }
      }
    }

    // Root saved requests
    for (const req of savedRequests) {
      result.push(requestItem(req, 'Unsaved', openSavedRequest, onClose))
    }

    return result
  }, [collections, savedRequests, tabs, openTab, openSavedRequest, setActiveTab, onClose])

  // Filter + sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 20)
    return items
      .filter((item) => fuzzy(q, item.label) || fuzzy(q, item.sublabel ?? ''))
      .sort((a, b) => {
        const sa = Math.min(fuzzyScore(q, a.label), fuzzyScore(q, a.sublabel ?? ''))
        const sb = Math.min(fuzzyScore(q, b.label), fuzzyScore(q, b.sublabel ?? ''))
        return sa - sb
      })
      .slice(0, 30)
  }, [items, query])

  // Clamp selection
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); filtered[selected]?.action() }
    if (e.key === 'Escape') { onClose() }
  }

  void activeTabId // consumed by actions

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100%-2rem)] sm:w-full p-0 gap-0 overflow-hidden top-[20%] translate-y-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search requests, tabs, actions…"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm h-8 px-0"
          />
        </div>

        <ScrollArea className="max-h-[400px]">
          <div ref={listRef} className="py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-muted-foreground/50 text-sm">No results</div>
            )}
            {filtered.map((item, idx) => (
              <PaletteRow
                key={item.id}
                item={item}
                idx={idx}
                isSelected={selected === idx}
                onHover={() => setSelected(idx)}
                onActivate={item.action}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground/40">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PaletteRow({
  item, idx, isSelected, onHover, onActivate,
}: {
  item: PaletteItem
  idx: number
  isSelected: boolean
  onHover: () => void
  onActivate: () => void
}) {
  const methodColor = item.method ? METHOD_COLORS[item.method as keyof typeof METHOD_COLORS] : undefined

  return (
    <button
      data-idx={idx}
      onMouseEnter={onHover}
      onClick={onActivate}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        isSelected ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/50'
      )}
    >
      <ItemIcon item={item} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate flex items-center gap-2">
          {item.method && (
            <span className="text-[10px] font-bold shrink-0" style={{ color: methodColor }}>{item.method}</span>
          )}
          {item.label}
        </div>
        {item.sublabel && (
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">{item.sublabel}</div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/30 shrink-0 capitalize">{item.kind}</span>
    </button>
  )
}

function ItemIcon({ item }: { item: PaletteItem }) {
  const cls = 'h-4 w-4 text-muted-foreground/40 shrink-0'
  switch (item.kind) {
    case 'action':
      if (item.id.includes('new-tab')) return <Plus className={cls} />
      if (item.id.includes('import')) return <Upload className={cls} />
      if (item.id.includes('env')) return <Settings className={cls} />
      if (item.id.includes('theme')) return <Zap className={cls} />
      return <Settings className={cls} />
    case 'tab': return <Layout className={cls} />
    case 'collection': return <Folder className={cls} />
    default: return <File className={cls} />
  }
}

function requestItem(
  req: SavedRequest,
  collectionName: string,
  openSavedRequest: (r: SavedRequest) => void,
  onClose: () => void
): PaletteItem {
  return {
    id: `request:${req.id}`,
    kind: 'request',
    label: req.name,
    sublabel: `${collectionName}  •  ${req.url || 'No URL'}`,
    method: req.method,
    action: () => { openSavedRequest(req); onClose() },
  }
}
