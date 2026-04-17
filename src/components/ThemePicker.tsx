import { useTheme } from '../hooks/useTheme'
import { applyTheme, THEMES } from '../themes'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export function ThemePicker({ open, onClose }: Props) {
  const { themeId, setThemeId } = useTheme()

  const handleHover = (id: string) => {
    const theme = THEMES.find((t) => t.id === id)
    if (theme) applyTheme(theme)
  }

  const handleLeave = () => {
    const current = THEMES.find((t) => t.id === themeId) ?? THEMES[0]
    applyTheme(current)
  }

  const handleSelect = (id: string) => {
    setThemeId(id)
  }

  const darkThemes = THEMES.filter((t) => t.isDark)
  const lightThemes = THEMES.filter((t) => !t.isDark)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { handleLeave(); onClose() } }}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden" onPointerLeave={handleLeave}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm">Theme</DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-4">
          <ThemeGroup label="Dark" themes={darkThemes} selected={themeId} onHover={handleHover} onSelect={handleSelect} />
          <ThemeGroup label="Light" themes={lightThemes} selected={themeId} onHover={handleHover} onSelect={handleSelect} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ThemeGroup({
  label,
  themes,
  selected,
  onHover,
  onSelect,
}: {
  label: string
  themes: typeof THEMES
  selected: string
  onHover: (id: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onMouseEnter={() => onHover(theme.id)}
            onClick={() => onSelect(theme.id)}
            className={cn(
              'group relative flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all',
              selected === theme.id ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
            )}
          >
            {/* Swatch */}
            <div
              className="w-full h-10 rounded-md relative overflow-hidden"
              style={{ backgroundColor: theme.swatch.bg }}
            >
              <div
                className="absolute bottom-0 right-0 w-5 h-5 rounded-tl-md"
                style={{ backgroundColor: theme.swatch.accent }}
              />
            </div>
            <span className="text-[10px] text-center leading-tight text-muted-foreground group-hover:text-foreground transition-colors line-clamp-2">
              {theme.name}
            </span>
            {selected === theme.id && (
              <Check className="absolute top-1 right-1 h-3 w-3 text-primary" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
