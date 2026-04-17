import { useState } from 'react'
import { useStore, useActiveTab } from '../store/useStore'
import type { Cookie } from '../types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { X, Plus, Trash2, Cookie as CookieIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

export function CookiePanel({ onClose }: Props) {
  const { collections, updateCookieJar, deleteCookie, clearCookies } = useStore()
  const activeTab = useActiveTab()

  // Default to active tab's collection, else first collection
  const defaultColId = activeTab?.collectionId ?? collections[0]?.id ?? ''
  const [selectedColId, setSelectedColId] = useState(defaultColId)
  const collection = collections.find((c) => c.id === selectedColId)
  const cookies = collection?.cookieJar?.cookies ?? []

  const [filterText, setFilterText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const filtered = filterText
    ? cookies.filter(
        (c) =>
          c.name.toLowerCase().includes(filterText.toLowerCase()) ||
          c.domain.toLowerCase().includes(filterText.toLowerCase()) ||
          c.value.toLowerCase().includes(filterText.toLowerCase())
      )
    : cookies

  // Group by domain
  const byDomain = filtered.reduce<Record<string, Cookie[]>>((acc, c) => {
    const d = c.domain || '(unknown)'
    ;(acc[d] ??= []).push(c)
    return acc
  }, {})

  const updateCookie = (cookieId: string, updates: Partial<Cookie>) => {
    if (!collection) return
    const updated = cookies.map((c) => (c.id === cookieId ? { ...c, ...updates } : c))
    updateCookieJar(collection.id, { cookies: updated })
  }

  const addCookie = () => {
    if (!collection) return
    const newCookie: Cookie = {
      id: crypto.randomUUID(),
      name: '',
      value: '',
      domain: '',
      path: '/',
      httpOnly: false,
      secure: false,
    }
    updateCookieJar(collection.id, { cookies: [...cookies, newCookie] })
    setEditingId(newCookie.id)
  }

  const now = Math.floor(Date.now() / 1000)

  return (
    <div className="flex flex-col w-[320px] h-full bg-card border-l border-border shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <CookieIcon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        <span className="text-xs font-semibold flex-1">Cookies</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
      </div>

      {/* Collection selector */}
      {collections.length > 1 && (
        <div className="px-3 py-2 border-b border-border shrink-0">
          <Select value={selectedColId} onValueChange={setSelectedColId}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select collection" />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Toolbar: filter + add + clear */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1.5">
        <Input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter…"
          className="h-7 text-xs flex-1"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={addCookie}
              disabled={!collection}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add cookie</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={() => collection && clearCookies(collection.id)}
              disabled={!collection || cookies.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear all</TooltipContent>
        </Tooltip>
      </div>

      {/* Cookie list */}
      <ScrollArea className="flex-1">
        {!collection ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-xs text-center px-4">
            No collection selected
          </div>
        ) : Object.keys(byDomain).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground/40 text-xs">
            <CookieIcon className="h-8 w-8 opacity-20" />
            No cookies stored
          </div>
        ) : (
          Object.entries(byDomain).map(([domain, domainCookies]) => (
            <div key={domain} className="border-b border-border/40 last:border-0">
              <div className="px-3 py-1 bg-muted/20 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {domain}
              </div>
              {domainCookies.map((cookie) => {
                const expired = cookie.expires ? cookie.expires < now : false
                const isEditing = editingId === cookie.id
                return (
                  <div
                    key={cookie.id}
                    className={cn(
                      'group px-3 py-2 border-b border-border/20 last:border-0 hover:bg-accent/10',
                      isEditing && 'bg-accent/10'
                    )}
                  >
                    {isEditing ? (
                      /* Expanded edit form */
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Name</p>
                            <Input
                              autoFocus
                              value={cookie.name}
                              onChange={(e) => updateCookie(cookie.id, { name: e.target.value })}
                              className="h-6 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Domain</p>
                            <Input
                              value={cookie.domain}
                              onChange={(e) => updateCookie(cookie.id, { domain: e.target.value })}
                              className="h-6 text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">Value</p>
                          <Input
                            value={cookie.value}
                            onChange={(e) => updateCookie(cookie.id, { value: e.target.value })}
                            className="h-6 text-xs font-mono"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Path</p>
                            <Input
                              value={cookie.path}
                              onChange={(e) => updateCookie(cookie.id, { path: e.target.value })}
                              className="h-6 text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-end gap-3 pb-0.5">
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cookie.secure}
                                onChange={(e) => updateCookie(cookie.id, { secure: e.target.checked })}
                                className="h-3 w-3"
                              />
                              Secure
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cookie.httpOnly}
                                onChange={(e) => updateCookie(cookie.id, { httpOnly: e.target.checked })}
                                className="h-3 w-3"
                              />
                              HttpOnly
                            </label>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-destructive hover:text-destructive px-2"
                            onClick={() => { deleteCookie(collection.id, cookie.id); setEditingId(null) }}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => setEditingId(null)}
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Collapsed row */
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setEditingId(cookie.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-foreground/90 truncate">{cookie.name || <em className="text-muted-foreground/40">unnamed</em>}</span>
                            {expired && <span className="text-[9px] text-destructive/70 shrink-0">expired</span>}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground/50 truncate">{cookie.value || '—'}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteCookie(collection.id, cookie.id) }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive text-muted-foreground transition-opacity shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </ScrollArea>

      {/* Footer count */}
      <div className="px-3 py-1.5 border-t border-border shrink-0 text-[10px] text-muted-foreground/50">
        {cookies.length} cookie{cookies.length !== 1 ? 's' : ''}
        {collection && <span className="ml-1">in {collection.name}</span>}
      </div>
    </div>
  )
}
