import { Download, X, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { useUpdater } from '../hooks/useUpdater'

export function UpdateBanner() {
  const { update, isDownloading, progress, error, applyUpdate, dismiss } = useUpdater()

  if (!update) return null

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-primary/10 border-b border-primary/20 text-sm shrink-0">
      <RefreshCw className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="flex-1 text-foreground/80">
        Update available:{' '}
        <span className="font-medium text-foreground">v{update.version}</span>
        {update.body && (
          <span className="text-muted-foreground"> — {update.body}</span>
        )}
      </span>
      {error && <span className="text-destructive text-xs">{error}</span>}
      {isDownloading ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress > 0 ? `${progress}%` : 'Downloading…'}
        </span>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="default"
            className="h-6 text-xs gap-1 px-2"
            onClick={applyUpdate}
          >
            <Download className="h-3 w-3" />
            Install & Restart
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={dismiss}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
