import { useState } from 'react'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { parseVarTokens, hasVars } from '../utils/envVars'
import { cn } from '@/lib/utils'

interface VarTextProps {
  text: string
  vars: Record<string, string>
  className?: string
}

/**
 * Renders a string with {{varName}} tokens shown as colored Badge chips.
 * Green-tinted = variable is defined in the active environment.
 * Amber-tinted = variable is not defined.
 * Hovering a badge shows the resolved value in the title attribute.
 */
export function VarText({ text, vars, className }: VarTextProps) {
  const tokens = parseVarTokens(text)
  return (
    <span className={cn('font-mono text-xs break-all', className)}>
      {tokens.map((token, i) =>
        token.type === 'text' ? (
          <span key={i}>{token.value}</span>
        ) : (
          <Badge
            key={i}
            variant="outline"
            title={vars[token.name] !== undefined ? `= ${vars[token.name]}` : 'Not defined in active environment'}
            className={cn(
              'inline-flex px-1 py-0 text-[10px] font-mono font-medium mx-0.5 align-middle leading-none h-4 rounded-sm',
              vars[token.name] !== undefined
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-amber-500/50 bg-amber-500/10 text-amber-400'
            )}
          >
            {token.name}
          </Badge>
        )
      )}
    </span>
  )
}

interface VarValueCellProps {
  value: string
  vars: Record<string, string>
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

/**
 * A value cell that shows {{varName}} as badges when not focused,
 * and switches to a plain text input when clicked.
 */
export function VarValueCell({ value, vars, onChange, placeholder, className }: VarValueCellProps) {
  const [editing, setEditing] = useState(false)

  if (editing || !hasVars(value)) {
    return (
      <Input
        autoFocus={editing}
        value={value}
        placeholder={placeholder ?? 'Value'}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        className={cn(
          'h-7 border-0 bg-transparent shadow-none focus-visible:bg-input focus-visible:ring-0 font-mono text-xs px-1',
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'h-7 px-1 flex items-center cursor-text rounded hover:bg-input/40 transition-colors',
        className
      )}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      <VarText text={value} vars={vars} />
    </div>
  )
}
