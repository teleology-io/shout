import { useState } from 'react'
import type { Collection, Cookie } from '../types'
import { useStore } from '../store/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Trash2, Plus } from 'lucide-react'

interface Props {
  collection: Collection
  open: boolean
  onClose: () => void
}

export function CookieJar({ collection, open, onClose }: Props) {
  const { deleteCookie, clearCookies, updateCookieJar } = useStore()
  const cookies = collection.cookieJar?.cookies ?? []
  const [filterText, setFilterText] = useState('')

  const filtered = filterText
    ? cookies.filter(
        (c) =>
          c.name.toLowerCase().includes(filterText.toLowerCase()) ||
          c.domain.toLowerCase().includes(filterText.toLowerCase())
      )
    : cookies

  // Group by domain
  const byDomain = filtered.reduce<Record<string, Cookie[]>>((acc, c) => {
    const d = c.domain || '(unknown)'
    if (!acc[d]) acc[d] = []
    acc[d].push(c)
    return acc
  }, {})

  const updateValue = (cookieId: string, newValue: string) => {
    const updated = cookies.map((c) => (c.id === cookieId ? { ...c, value: newValue } : c))
    updateCookieJar(collection.id, { cookies: updated })
  }

  const addCookie = () => {
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
  }

  const now = Math.floor(Date.now() / 1000)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[calc(100%-2rem)] p-0 gap-0 max-h-[80vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">Cookie Jar — {collection.name}</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2 border-b border-border shrink-0 flex items-center gap-2">
          <Input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter by name or domain…"
            className="h-7 text-xs flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 shrink-0"
            onClick={addCookie}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 shrink-0 text-destructive hover:text-destructive"
            onClick={() => clearCookies(collection.id)}
            disabled={cookies.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear All
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {Object.keys(byDomain).length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-sm">
              No cookies stored for this collection
            </div>
          ) : (
            Object.entries(byDomain).map(([domain, domainCookies]) => (
              <div key={domain} className="border-b border-border/50 last:border-0">
                <div className="px-4 py-1.5 bg-muted/20 text-xs font-medium text-muted-foreground">
                  {domain}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground w-[25%]">Name</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground">Value</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground w-[80px]">Path</th>
                      <th className="px-4 py-1.5 text-left font-medium text-muted-foreground w-[80px]">Expires</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {domainCookies.map((cookie) => {
                      const expired = cookie.expires ? cookie.expires < now : false
                      return (
                        <tr key={cookie.id} className="border-b border-border/20 group hover:bg-accent/10">
                          <td className="px-4 py-1.5 font-mono text-foreground/90">{cookie.name}</td>
                          <td className="px-4 py-1.5">
                            <Input
                              value={cookie.value}
                              onChange={(e) => updateValue(cookie.id, e.target.value)}
                              className="h-6 font-mono text-xs border-0 bg-transparent shadow-none focus-visible:bg-input px-1"
                            />
                          </td>
                          <td className="px-4 py-1.5 text-muted-foreground font-mono">{cookie.path}</td>
                          <td className="px-4 py-1.5">
                            {cookie.expires ? (
                              <span className={expired ? 'text-destructive' : 'text-muted-foreground'}>
                                {expired ? 'Expired' : new Date(cookie.expires * 1000).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">Session</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                              onClick={() => deleteCookie(collection.id, cookie.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </ScrollArea>

        <div className="px-4 py-2 border-t border-border shrink-0 text-xs text-muted-foreground">
          {cookies.length} cookie{cookies.length !== 1 ? 's' : ''} stored
        </div>
      </DialogContent>
    </Dialog>
  )
}
