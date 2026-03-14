import { useRef, useState, useCallback } from 'react'
import { useStore, useActiveTab } from './store/useStore'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { RequestPanel } from './components/RequestPanel'
import { ResponsePanel } from './components/ResponsePanel'
import { Sheet, SheetContent } from './components/ui/sheet'
import { Button } from './components/ui/button'
import { TooltipProvider } from './components/ui/tooltip'
import { UpdateBanner } from './components/UpdateBanner'
import { Plus } from 'lucide-react'

export default function App() {
  const { tabs, openTab } = useStore()
  const activeTab = useActiveTab()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const [splitPercent, setSplitPercent] = useState(45)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

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

  return (
    <TooltipProvider delayDuration={600}>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">

        {/* Desktop sidebar (md+) */}
        <div className="hidden md:flex md:w-[320px] md:shrink-0 md:overflow-hidden border-r border-border">
          <Sidebar onNavigate={() => {}} />
        </div>

        {/* Mobile sidebar as Sheet */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0 border-r border-border">
            <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0">
          <UpdateBanner />
          <TabBar onMenuClick={() => setMobileSidebarOpen(true)} />

          {tabs.length === 0 || !activeTab ? (
            <EmptyState onNewRequest={() => openTab()} />
          ) : (
            <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
              {/* Request panel */}
              <div className="min-h-0 overflow-hidden" style={{ height: `${splitPercent}%` }}>
                <RequestPanel tab={activeTab} />
              </div>

              {/* Drag divider */}
              <div
                onMouseDown={onDividerMouseDown}
                className="h-[5px] shrink-0 cursor-row-resize flex items-center justify-center group bg-border/30 hover:bg-primary/30 transition-colors"
              >
                <div className="w-10 h-0.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60 transition-colors" />
              </div>

              {/* Response panel */}
              <div
                className="min-h-0 overflow-hidden flex flex-col"
                style={{ height: `${100 - splitPercent}%` }}
              >
                <ResponsePanel
                  response={activeTab.response}
                  isLoading={activeTab.isLoading}
                  error={activeTab.error}
                />
              </div>
            </div>
          )}
        </div>
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
