import { useState } from 'react'
import type { RequestTab } from '../types'
import {
  buildCurlCommand,
  buildWgetCommand,
  buildPythonSnippet,
  buildJavaScriptSnippet,
} from '../utils/http'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type Lang = 'curl' | 'wget' | 'python' | 'javascript'

const LANGS: { id: Lang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'wget', label: 'wget' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
]

interface Props {
  tab: RequestTab
  open: boolean
  onClose: () => void
}

export function CodeSnippetDialog({ tab, open, onClose }: Props) {
  const [lang, setLang] = useState<Lang>('curl')
  const [copied, setCopied] = useState(false)

  const snippets: Record<Lang, string> = {
    curl: buildCurlCommand(tab),
    wget: buildWgetCommand(tab),
    python: buildPythonSnippet(tab),
    javascript: buildJavaScriptSnippet(tab),
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[lang])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Code Snippet</DialogTitle>
        </DialogHeader>

        {/* Language tab strip */}
        <div className="flex gap-0.5 px-5 border-b border-border">
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => { setLang(l.id); setCopied(false) }}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                lang === l.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Code block */}
        <div className="relative m-5 rounded-md border border-border bg-muted/20 overflow-hidden">
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 h-7 w-7 z-10"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied
              ? <Check className="h-3.5 w-3.5 text-green-500" />
              : <Copy className="h-3.5 w-3.5" />
            }
          </Button>

          <ScrollArea className="max-h-[380px]">
            <pre className="p-4 pr-12 text-xs font-mono text-foreground whitespace-pre leading-relaxed select-all">
              {snippets[lang]}
            </pre>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
