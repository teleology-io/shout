import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import type { CollectionGroup } from '../types'

/** Recursively find the group that contains a given request ID. */
export function findGroupForRequest(groups: CollectionGroup[], requestId: string): CollectionGroup | undefined {
  for (const group of groups) {
    if (group.requests.some((r) => r.id === requestId)) return group
    const found = findGroupForRequest(group.groups ?? [], requestId)
    if (found) return found
  }
  return undefined
}

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

/** Returns merged variables: collection env + folder-level (folder wins on conflict). */
export function useResolvedEnvVars(collectionId?: string | null, savedRequestId?: string): Record<string, string> {
  const collections = useStore((s) => s.collections)

  return useMemo(() => {
    if (!collectionId) return {}
    const col = collections.find((c) => c.id === collectionId)
    if (!col) return {}

    // Collection env vars
    const env = col.environments?.find((e) => e.id === col.activeEnvironmentId)
    const colVars: Record<string, string> = {}
    for (const v of env?.variables ?? []) {
      if (v.enabled && v.key) colVars[v.key] = v.value
    }

    // Folder vars (override collection vars)
    const groupVars: Record<string, string> = {}
    if (savedRequestId) {
      const group = findGroupForRequest(col.groups ?? [], savedRequestId)
      for (const v of group?.variables ?? []) {
        if (v.enabled && v.key) groupVars[v.key] = v.value
      }
    }

    return { ...colVars, ...groupVars }
  }, [collectionId, savedRequestId, collections])
}
