import { useState, useEffect } from 'react'
import type { ProxyConfig } from '../types'
import { useStore } from '../store/useStore'
import { useTheme } from '../hooks/useTheme'
import { applyTheme, THEMES } from '../themes'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  defaultTab?: string
}

const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  type: 'http',
  host: '',
  port: 8080,
}

export function SettingsModal({ open, onClose, defaultTab = 'network' }: Props) {
  const { globalProxy, setGlobalProxy } = useStore()
  const [proxy, setProxy] = useState<ProxyConfig>(globalProxy ?? DEFAULT_PROXY)
  const [tab, setTab] = useState(defaultTab)

  // Reset tab when the modal opens with a specific defaultTab
  useEffect(() => {
    if (open) {
      setProxy(globalProxy ?? DEFAULT_PROXY)
      setTab(defaultTab)
    }
  }, [open, defaultTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateProxy = (updates: Partial<ProxyConfig>) => {
    setProxy((p) => ({ ...p, ...updates }))
  }

  const save = () => {
    setGlobalProxy(proxy.host ? proxy : null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100%-2rem)] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm">Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
          <TabsList className="mx-5 mt-3 mb-0 h-8 bg-muted/50 w-auto border-b-0">
            <TabsTrigger value="network" className="text-xs">Network</TabsTrigger>
            <TabsTrigger value="theme" className="text-xs">Theme</TabsTrigger>
          </TabsList>

          <TabsContent value="network" className="px-5 py-4 space-y-4 mt-0">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Global Proxy
              </h3>

              <div className="flex items-center gap-2 mb-4">
                <Switch
                  checked={proxy.enabled}
                  onCheckedChange={(v) => updateProxy({ enabled: v })}
                  id="proxy-enabled"
                />
                <Label htmlFor="proxy-enabled" className="text-sm cursor-pointer">
                  Enable proxy
                </Label>
              </div>

              <div className={proxy.enabled ? '' : 'opacity-50 pointer-events-none'}>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="col-span-1">
                    <Label className="text-xs mb-1 block">Type</Label>
                    <Select
                      value={proxy.type}
                      onValueChange={(v) => updateProxy({ type: v as ProxyConfig['type'] })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http" className="text-xs">HTTP</SelectItem>
                        <SelectItem value="https" className="text-xs">HTTPS</SelectItem>
                        <SelectItem value="socks5" className="text-xs">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">Host</Label>
                    <Input
                      value={proxy.host}
                      onChange={(e) => updateProxy({ host: e.target.value })}
                      placeholder="127.0.0.1"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <Label className="text-xs mb-1 block">Port</Label>
                  <Input
                    type="number"
                    value={proxy.port}
                    onChange={(e) => updateProxy({ port: Number(e.target.value) })}
                    className="h-8 text-xs w-24 font-mono"
                    min={1}
                    max={65535}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">Username (optional)</Label>
                    <Input
                      value={proxy.authUsername ?? ''}
                      onChange={(e) => updateProxy({ authUsername: e.target.value || undefined })}
                      placeholder="Username"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Password (optional)</Label>
                    <Input
                      type="password"
                      value={proxy.authPassword ?? ''}
                      onChange={(e) => updateProxy({ authPassword: e.target.value || undefined })}
                      placeholder="Password"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {globalProxy && (
                <p className="text-xs text-muted-foreground mt-3">
                  Active: {globalProxy.type}://{globalProxy.host}:{globalProxy.port}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="theme" className="px-5 py-4 mt-0">
            <ThemeTabContent />
          </TabsContent>
        </Tabs>

        {tab === 'network' && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
            <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="text-xs" onClick={save}>Save</Button>
          </div>
        )}
        {tab === 'theme' && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
            <Button size="sm" className="text-xs" onClick={onClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Theme tab ─────────────────────────────────────────────────────────────────

function ThemeTabContent() {
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
    <div className="space-y-4" onMouseLeave={handleLeave}>
      <ThemeGroup label="Dark" themes={darkThemes} selected={themeId} onHover={handleHover} onSelect={handleSelect} />
      <ThemeGroup label="Light" themes={lightThemes} selected={themeId} onHover={handleHover} onSelect={handleSelect} />
    </div>
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
