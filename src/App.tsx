import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore, useActiveTab } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { RequestPanel } from './components/RequestPanel'
import { ResponsePanel } from './components/ResponsePanel'
import { ShortcutsModal } from './components/ShortcutsModal'
import { CommandPalette } from './components/CommandPalette'
import { SettingsModal } from './components/SettingsModal'
import { CookiePanel } from './components/CookiePanel'
import { Sheet, SheetContent } from './components/ui/sheet'
import { Button } from './components/ui/button'
import { TooltipProvider } from './components/ui/tooltip'
import { UpdateBanner } from './components/UpdateBanner'
import { useTheme } from './hooks/useTheme'
import { Plus } from 'lucide-react' // used in EmptyState
import { IconLayoutSidebar, IconLayoutSidebarFilled, IconLayoutBottombar, IconLayoutBottombarFilled, IconLayoutSidebarRight, IconLayoutSidebarRightFilled } from '@tabler/icons-react'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 560
const SIDEBAR_DEFAULT = 260

const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')

export default function App() {
  const { tabs, activeTabId, openTab, closeTab, setActiveTab, sendRequest, saveTabToCollection, saveTabToRoot } = useStore()
  const activeTab = useActiveTab()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [responseVisible, setResponseVisible] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('network')
  const [cookiePanelOpen, setCookiePanelOpen] = useState(false)
  useTheme() // apply stored theme on mount

  const [splitPercent, setSplitPercent] = useState(45)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const sidebarResizing = useRef(false)

  const onDividerMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientY - rect.top) / rect.height) * 100
      setSplitPercent(Math.min(Math.max(pct, 20), 80))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const onSidebarDividerMouseDown = useCallback(() => {
    sidebarResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e: MouseEvent) => {
      if (!sidebarResizing.current) return
      setSidebarWidth(Math.min(Math.max(e.clientX, SIDEBAR_MIN), SIDEBAR_MAX))
    }
    const onUp = () => {
      sidebarResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return

      // Cmd+Enter → send
      if (e.key === 'Enter') {
        e.preventDefault()
        if (activeTabId) sendRequest(activeTabId)
        return
      }

      // Cmd+S → save
      if (e.key === 's') {
        e.preventDefault()
        const tab = tabs.find((t) => t.id === activeTabId)
        if (!tab) return
        if (tab.savedRequestId && tab.collectionId) {
          saveTabToCollection(tab.id, tab.collectionId, tab.name)
        } else if (tab.savedRequestId && !tab.collectionId) {
          saveTabToRoot(tab.id, tab.name)
        } else {
          // Fire event for RequestPanel to open its save dialog
          window.dispatchEvent(new CustomEvent('shout:open-save'))
        }
        return
      }

      // Cmd+T → new tab
      if (e.key === 't') {
        e.preventDefault()
        openTab()
        return
      }

      // Cmd+W → close current tab
      if (e.key === 'w') {
        e.preventDefault()
        if (activeTabId) closeTab(activeTabId)
        return
      }

      // Cmd+/ → toggle sidebar
      if (e.key === '/') {
        e.preventDefault()
        setSidebarVisible((v) => !v)
        return
      }

      // Cmd+? → shortcuts modal
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      // Cmd+, → settings (theme tab)
      if (e.key === ',') {
        e.preventDefault()
        setSettingsTab('theme')
        setSettingsOpen(true)
        return
      }

      // Cmd+K → command palette
      if (e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      // Cmd+Shift+E → environment editor
      if (e.shiftKey && e.key === 'E') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('shout:open-environments'))
        return
      }

      // Cmd+Shift+I → import modal
      if (e.shiftKey && e.key === 'I') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('shout:open-import'))
        return
      }

      // Cmd+1–9 → switch tab
      const n = parseInt(e.key)
      if (n >= 1 && n <= 9) {
        const target = tabs[n - 1]
        if (target) {
          e.preventDefault()
          setActiveTab(target.id)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, tabs, sendRequest, openTab, closeTab, setActiveTab, saveTabToCollection, saveTabToRoot])

  // Listen for sidebar-dispatched events
  useEffect(() => {
    const openShortcuts = () => setShortcutsOpen(true)
    const openPalette = () => setPaletteOpen(true)
    const openSettings = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab ?? 'network'
      setSettingsTab(tab)
      setSettingsOpen(true)
    }
    // Legacy: theme picker now opens settings on theme tab
    const openThemePicker = () => {
      setSettingsTab('theme')
      setSettingsOpen(true)
    }
    window.addEventListener('shout:open-shortcuts', openShortcuts)
    window.addEventListener('shout:open-palette', openPalette)
    window.addEventListener('shout:open-settings', openSettings)
    window.addEventListener('shout:open-theme-picker', openThemePicker)
    return () => {
      window.removeEventListener('shout:open-shortcuts', openShortcuts)
      window.removeEventListener('shout:open-palette', openPalette)
      window.removeEventListener('shout:open-settings', openSettings)
      window.removeEventListener('shout:open-theme-picker', openThemePicker)
    }
  }, [])

  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">

        {/* Desktop sidebar (md+) */}
        {sidebarVisible && (
          <div
            className="hidden md:flex md:shrink-0 md:overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            <Sidebar onNavigate={() => {}} />
          </div>
        )}

        {/* Sidebar resize handle */}
        {sidebarVisible && (
          <div
            onMouseDown={(e) => { e.preventDefault(); onSidebarDividerMouseDown() }}
            className="hidden md:block w-[4px] shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors select-none"
          />
        )}

        {/* Mobile sidebar as Sheet — only opens on mobile */}
        <Sheet open={isMobile && sidebarVisible} onOpenChange={(open) => { if (!open) setSidebarVisible(false) }}>
          <SheetContent side="left" className="w-[280px] p-0 border-r border-border">
            <Sidebar onNavigate={() => setSidebarVisible(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content column */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          <UpdateBanner />
          <div className="flex items-center border-b border-border shrink-0 h-10">
            <TabBar />
            {/* Layout toggles */}
            <div className="flex items-center gap-0.5 px-1 shrink-0 border-l border-border h-full">
              <button
                onClick={() => setSidebarVisible((v) => !v)}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Toggle sidebar"
              >
                {sidebarVisible ? <IconLayoutSidebarFilled size={16} /> : <IconLayoutSidebar size={16} />}
              </button>
              <button
                onClick={() => setResponseVisible((v) => !v)}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Toggle response panel"
              >
                {responseVisible ? <IconLayoutBottombarFilled size={16} /> : <IconLayoutBottombar size={16} />}
              </button>
              <button
                onClick={() => setCookiePanelOpen((v) => !v)}
                className={`h-7 w-7 flex items-center justify-center rounded hover:bg-accent transition-colors ${cookiePanelOpen ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground'}`}
                title="Cookies"
              >
                {cookiePanelOpen ? <IconLayoutSidebarRightFilled size={16} /> : <IconLayoutSidebarRight size={16} />}
              </button>
            </div>
          </div>

          {tabs.length === 0 || !activeTab ? (
            <EmptyState onNewRequest={() => openTab()} />
          ) : (
            <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
              <div
                className="min-h-0 overflow-hidden"
                style={{ height: responseVisible ? `${splitPercent}%` : '100%' }}
              >
                <RequestPanel tab={activeTab} />
              </div>

              {responseVisible && (
                <div
                  onMouseDown={(e) => { e.preventDefault(); onDividerMouseDown() }}
                  className="h-[5px] shrink-0 cursor-row-resize flex items-center justify-center group bg-border/30 hover:bg-primary/30 transition-colors select-none"
                >
                  <div className="w-10 h-0.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60 transition-colors" />
                </div>
              )}

              {responseVisible && (
                <div
                  className="min-h-0 overflow-hidden flex flex-col"
                  style={{ height: `${100 - splitPercent}%` }}
                >
                  <ResponsePanel
                    response={activeTab.response}
                    isLoading={activeTab.isLoading}
                    error={activeTab.error}
                    tab={activeTab}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cookie panel — full height, root-level sibling of sidebar */}
        {cookiePanelOpen && (
          <CookiePanel onClose={() => setCookiePanelOpen(false)} />
        )}

        <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} defaultTab={settingsTab} />
      </div>
    </TooltipProvider>
  )
}

function EmptyState({ onNewRequest }: { onNewRequest: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center select-none">
        <h1 className="text-primary text-5xl font-bold tracking-tight mb-2">shout</h1>
        <p className="text-muted-foreground text-sm">A fast, simple API client</p>
      </div>
      <Button onClick={onNewRequest} size="lg" className="gap-2">
        <Plus className="h-4 w-4" />
        New Request
      </Button>
      <p className="text-muted-foreground/40 text-xs text-center leading-relaxed">
        Import an OpenAPI spec from the sidebar<br />or create a request manually
      </p>
    </div>
  )
}
