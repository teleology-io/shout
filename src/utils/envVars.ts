import { useMemo } from 'react'
import { useStore } from '../store/useStore'

export type VarToken =
  | { type: 'text'; value: string }
  | { type: 'var'; name: string }

/** Split a string into literal text and {{varName}} tokens. */
export function parseVarTokens(text: string): VarToken[] {
  const tokens: VarToken[] = []
  const regex = /\{\{([\w.-]+)\}\}/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) tokens.push({ type: 'text', value: text.slice(last, match.index) })
    tokens.push({ type: 'var', name: match[1] })
    last = regex.lastIndex
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}

export function hasVars(text: string): boolean {
  return /\{\{[\w.-]+\}\}/.test(text)
}

/** Returns a map of enabled variables from the collection's active environment. */
export function useCollectionEnvVars(collectionId?: string | null): Record<string, string> {
  // Select only the stable array reference — changes only when the store mutates,
  // not on every render. This avoids the infinite-loop from returning a new {} each call.
  const collections = useStore((s) => s.collections)

  return useMemo(() => {
    if (!collectionId) return {}
    const col = collections.find((c) => c.id === collectionId)
    if (!col?.activeEnvironmentId) return {}
    const env = col.environments?.find((e) => e.id === col.activeEnvironmentId)
    if (!env) return {}
    const vars: Record<string, string> = {}
    for (const v of env.variables) {
      if (v.enabled && v.key) vars[v.key] = v.value
    }
    return vars
  }, [collectionId, collections])
}
