import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
const mod = isMac ? '⌘' : 'Ctrl'

const SHORTCUTS = [
  {
    category: 'Requests',
    items: [
      { keys: [mod, 'Enter'], description: 'Send current request' },
      { keys: [mod, 'S'], description: 'Save current request' },
    ],
  },
  {
    category: 'Tabs',
    items: [
      { keys: [mod, 'T'], description: 'New tab' },
      { keys: [mod, 'W'], description: 'Close current tab' },
      { keys: [mod, '1–9'], description: 'Switch to tab N' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: [mod, 'K'], description: 'Command palette' },
      { keys: [mod, '/'], description: 'Toggle sidebar' },
      { keys: [mod, 'Shift', 'E'], description: 'Open environment editor' },
      { keys: [mod, 'Shift', 'I'], description: 'Open import modal' },
      { keys: [mod, '?'], description: 'Show shortcuts' },
    ],
  },
]

export function ShortcutsModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {SHORTCUTS.map((group) => (
            <div key={group.category}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.category}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-foreground/70">{item.description}</span>
                    <div className="flex gap-1 shrink-0">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border border-border rounded"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
