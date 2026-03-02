import { useRef, useCallback } from 'react'
import { Button } from './ui/button'
import { tokenizeJson, TOKEN_COLORS } from '../utils/jsonHighlight'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

const PLACEHOLDER = '{\n  "key": "value"\n}'

export function JsonEditor({ value, onChange, placeholder = PLACEHOLDER }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const syncScroll = useCallback(() => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }, [])

  const handleFormat = () => {
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2))
    } catch {
      // not valid JSON — leave as-is
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-end px-2 py-1 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={handleFormat}
          disabled={!value.trim()}
          title="Pretty-print JSON"
        >
          Format
        </Button>
      </div>

      {/* Editor area: pre overlay + transparent textarea */}
      <div className="relative flex-1 min-h-0">
        <pre
          ref={preRef}
          aria-hidden
          className="absolute inset-0 p-3 overflow-auto pointer-events-none text-sm font-mono leading-relaxed whitespace-pre-wrap break-all"
        >
          {value
            ? tokenizeJson(value).map((t, i) => (
                <span key={i} style={{ color: TOKEN_COLORS[t.type] }}>{t.value}</span>
              ))
            : <span className="text-muted-foreground/40">{placeholder}</span>
          }
          {/* extra newline keeps pre height in sync with textarea */}
          {'\n'}
        </pre>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          autoComplete="off"
          className="absolute inset-0 w-full h-full p-3 bg-transparent resize-none outline-none text-sm font-mono leading-relaxed whitespace-pre-wrap"
          style={{ color: 'transparent', caretColor: 'hsl(var(--foreground))' }}
        />
      </div>
    </div>
  )
}
