import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Button } from './ui/button'
import { ScrollArea, ScrollBar } from './ui/scroll-area'
import { Plus, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContextMenu {
  tabId: string
  x: number
  y: number
}

export function TabBar() {
  const { tabs, activeTabId, closeTab, closeOtherTabs, closeTabsToRight, closeAllTabs, setActiveTab, openTab } = useStore()
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  const openContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ tabId, x: e.clientX, y: e.clientY })
  }

  const ctxTabIndex = contextMenu ? tabs.findIndex((t) => t.id === contextMenu.tabId) : -1
  const hasTabsToRight = ctxTabIndex >= 0 && ctxTabIndex < tabs.length - 1

  return (
    <div className="flex items-center bg-background flex-1 min-w-0 h-10">
      {/* Global search */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 ml-1 h-7 w-7 text-muted-foreground"
        onClick={() => window.dispatchEvent(new CustomEvent('shout:open-palette'))}
        aria-label="Search (⌘K)"
      >
        <Search className="h-4 w-4" />
      </Button>

      {/* Scrollable tabs */}
      <ScrollArea className="flex-1 min-w-0" type="scroll">
        <div className="flex items-end h-10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => openContextMenu(e, tab.id)}
              className={cn(
                'group relative flex items-center gap-1.5 px-3 h-full text-xs whitespace-nowrap border-r border-border shrink-0 max-w-[180px] transition-colors',
                tab.id === activeTabId
                  ? 'bg-card text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {tab.isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              )}
              <span className="truncate">{tab.name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="shrink-0 h-4 w-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted transition-all ml-0.5"
                role="button"
                aria-label="Close tab"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* New tab button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openTab()}
        className="shrink-0 mr-1 h-7 w-7"
        aria-label="New request"
      >
        <Plus className="h-4 w-4" />
      </Button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-md shadow-lg py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2"
            onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null) }}
          >
            Close
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
            onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null) }}
          >
            Close Others
          </button>
          {hasTabsToRight && (
            <button
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
              onClick={() => { closeTabsToRight(contextMenu.tabId); setContextMenu(null) }}
            >
              Close to the Right
            </button>
          )}
          <div className="my-1 border-t border-border" />
          <button
            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-destructive/80 hover:text-destructive"
            onClick={() => { closeAllTabs(); setContextMenu(null) }}
          >
            Close All
          </button>
        </div>
      )}
    </div>
  )
}
