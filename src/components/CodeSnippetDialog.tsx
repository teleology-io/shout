import { useState } from 'react'
import type { RequestTab } from '../types'
import {
  buildCurlCommand,
  buildWgetCommand,
  buildPythonSnippet,
  buildJavaScriptSnippet,
  buildGoSnippet,
  buildRubySnippet,
  buildPhpSnippet,
  buildRustSnippet,
  buildJavaSnippet,
  buildCsharpSnippet,
  buildHttpieSnippet,
} from '../utils/http'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type Lang = 'curl' | 'wget' | 'httpie' | 'python' | 'javascript' | 'go' | 'ruby' | 'php' | 'rust' | 'java' | 'csharp'

interface LangDef { id: Lang; label: string; group: string }

const LANGS: LangDef[] = [
  { id: 'curl', label: 'cURL', group: 'Shell' },
  { id: 'wget', label: 'wget', group: 'Shell' },
  { id: 'httpie', label: 'HTTPie', group: 'Shell' },
  { id: 'javascript', label: 'JavaScript', group: 'Languages' },
  { id: 'python', label: 'Python', group: 'Languages' },
  { id: 'go', label: 'Go', group: 'Languages' },
  { id: 'rust', label: 'Rust', group: 'Languages' },
  { id: 'ruby', label: 'Ruby', group: 'Languages' },
  { id: 'php', label: 'PHP', group: 'Languages' },
  { id: 'java', label: 'Java', group: 'Languages' },
  { id: 'csharp', label: 'C#', group: 'Languages' },
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
    httpie: buildHttpieSnippet(tab),
    python: buildPythonSnippet(tab),
    javascript: buildJavaScriptSnippet(tab),
    go: buildGoSnippet(tab),
    ruby: buildRubySnippet(tab),
    php: buildPhpSnippet(tab),
    rust: buildRustSnippet(tab),
    java: buildJavaSnippet(tab),
    csharp: buildCsharpSnippet(tab),
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

        {/* Language tab strip — grouped */}
        <div className="px-4 border-b border-border overflow-x-auto">
          {['Shell', 'Languages'].map((group) => (
            <div key={group} className="inline-flex items-center gap-0.5 mr-3">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40 mr-1 select-none">{group}</span>
              {LANGS.filter((l) => l.group === group).map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setLang(l.id); setCopied(false) }}
                  className={cn(
                    'px-2.5 py-2 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                    lang === l.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
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
