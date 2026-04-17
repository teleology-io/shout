import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Collection,
  CollectionGroup,
  Environment,
  EnvVariable,
  RequestTab,
  HttpMethod,
  KeyValue,
  RequestBody,
  Auth,
  ResponseData,
  HistoricResponse,
  SavedRequest,
  ProxyConfig,
  Cookie,
  CookieJar,
  ResponseExtraction,
  WsMessage,
  SseEvent,
  OAuth2Config,
} from '../types'
import { newTab } from '../types'
import { makeRequest } from '../utils/http'
import { parseSetCookieHeader, cookiesForRequest, formatCookieHeader, mergeCookies } from '../utils/cookies'
import { runExtractions } from '../utils/extraction'

// ── Connection unlisten refs (module-level, not persisted) ────────────────────
const wsUnlisteners = new Map<string, () => void>()
const sseUnlisteners = new Map<string, () => void>()
const streamUnlisteners = new Map<string, () => void>()

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ── Store types ───────────────────────────────────────────────────────────────

interface AppState {
  collections: Collection[]
  savedRequests: SavedRequest[]
  tabs: RequestTab[]
  activeTabId: string | null
  themeId: string
  globalProxy: ProxyConfig | null

  setThemeId: (id: string) => void
  setGlobalProxy: (config: ProxyConfig | null) => void

  // Collection actions
  addCollection: (name: string, description?: string) => Collection
  updateCollection: (id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>) => void
  deleteCollection: (id: string) => void
  addSavedRequest: (collectionId: string, request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) => void
  deleteSavedRequest: (collectionId: string, requestId: string) => void
  updateCollectionProxy: (collectionId: string, proxy: ProxyConfig | undefined) => void

  // Root-level saved requests (not in any collection)
  saveTabToRoot: (tabId: string, name: string) => SavedRequest
  deleteRootRequest: (id: string) => void
  moveRequestsToRoot: (collectionId: string, requestIds: string[]) => void
  moveSavedRequestsToCollection: (requestIds: string[], collectionId: string, groupId: string | null) => void

  // Group actions
  addGroup: (collectionId: string, name: string) => CollectionGroup
  addSubGroup: (collectionId: string, parentGroupId: string, name: string) => CollectionGroup
  deleteGroup: (collectionId: string, groupId: string) => void
  renameGroup: (collectionId: string, groupId: string, name: string) => void
  moveRequestToGroup: (collectionId: string, requestId: string, groupId: string | null) => void
  moveRequestsToGroup: (collectionId: string, requestIds: string[], groupId: string | null) => void
  updateGroupVariables: (collectionId: string, groupId: string, variables: EnvVariable[]) => void
  updateGroupAuth: (collectionId: string, groupId: string, auth: Auth | undefined) => void
  updateCollectionAuth: (collectionId: string, auth: Auth | undefined) => void

  // Environment actions
  addEnvironment: (collectionId: string, name: string) => Environment
  deleteEnvironment: (collectionId: string, envId: string) => void
  renameEnvironment: (collectionId: string, envId: string, name: string) => void
  setActiveEnvironment: (collectionId: string, envId: string | null) => void
  updateEnvironmentVariables: (collectionId: string, envId: string, variables: EnvVariable[]) => void

  // Tab actions
  openTab: (partial?: Partial<RequestTab>) => void
  openSavedRequest: (request: SavedRequest) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void
  closeAllTabs: () => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<RequestTab>) => void
  saveTabToCollection: (tabId: string, collectionId: string, name: string) => void

  // Request actions
  sendRequest: (tabId: string) => Promise<void>
  clearResponseHistory: (requestId: string) => void

  // WebSocket actions
  connectWs: (tabId: string) => Promise<void>
  disconnectWs: (tabId: string) => Promise<void>
  sendWsMessage: (tabId: string, data: string) => Promise<void>

  // SSE actions
  connectSse: (tabId: string) => Promise<void>
  disconnectSse: (tabId: string) => Promise<void>

  // Streaming actions
  startStreamRequest: (tabId: string) => Promise<void>
  cancelStream: (tabId: string) => Promise<void>

  // Cookie actions
  updateCookieJar: (collectionId: string, jar: CookieJar) => void
  deleteCookie: (collectionId: string, cookieId: string) => void
  clearCookies: (collectionId: string) => void

  // Extraction actions
  updateRequestExtractions: (collectionId: string, requestId: string, extractions: ResponseExtraction[]) => void

  // OAuth2 actions
  fetchOAuth2Token: (tabId: string) => Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectAllRequests(groups: CollectionGroup[], targetId: string): SavedRequest[] {
  for (const g of groups) {
    if (g.id === targetId) {
      const all = [...g.requests]
      for (const sub of g.groups ?? []) all.push(...collectAllRequests([sub], sub.id))
      return all
    }
    const found = collectAllRequests(g.groups ?? [], targetId)
    if (found.length) return found
  }
  return []
}

function insertRequestsIntoGroup(groups: CollectionGroup[], groupId: string, requests: SavedRequest[]): CollectionGroup[] {
  return groups.map((g) => {
    if (g.id === groupId) return { ...g, requests: [...g.requests, ...requests] }
    if (g.groups?.length) return { ...g, groups: insertRequestsIntoGroup(g.groups, groupId, requests) }
    return g
  })
}

function insertRequestIntoGroup(groups: CollectionGroup[], groupId: string, request: SavedRequest): CollectionGroup[] {
  return groups.map((g) => {
    if (g.id === groupId) return { ...g, requests: [...g.requests, request] }
    if (g.groups?.length) return { ...g, groups: insertRequestIntoGroup(g.groups, groupId, request) }
    return g
  })
}

function removeGroupById(groups: CollectionGroup[], id: string): CollectionGroup[] {
  return groups
    .filter((g) => g.id !== id)
    .map((g) => (g.groups?.length ? { ...g, groups: removeGroupById(g.groups, id) } : g))
}

function mapGroupById(groups: CollectionGroup[], id: string, fn: (g: CollectionGroup) => CollectionGroup): CollectionGroup[] {
  return groups.map((g) => {
    if (g.id === id) return fn(g)
    if (g.groups?.length) return { ...g, groups: mapGroupById(g.groups, id, fn) }
    return g
  })
}

function findGroupForRequest(groups: CollectionGroup[], requestId: string): CollectionGroup | undefined {
  for (const g of groups) {
    if (g.requests.some((r) => r.id === requestId)) return g
    const found = findGroupForRequest(g.groups ?? [], requestId)
    if (found) return found
  }
  return undefined
}

function appendHistory(req: SavedRequest, historic: HistoricResponse): SavedRequest {
  const history = [...(req.responseHistory ?? []), historic].slice(-10)
  return { ...req, responseHistory: history }
}

function extractRequestFromGroups(
  groups: CollectionGroup[],
  requestId: string,
): { request: SavedRequest | undefined; groups: CollectionGroup[] } {
  let found: SavedRequest | undefined
  const newGroups = groups.map((g) => {
    const idx = g.requests.findIndex((r) => r.id === requestId)
    if (idx >= 0) {
      found = g.requests[idx]
      return { ...g, requests: g.requests.filter((r) => r.id !== requestId) }
    }
    if (g.groups?.length) {
      const result = extractRequestFromGroups(g.groups, requestId)
      if (result.request) {
        found = result.request
        return { ...g, groups: result.groups }
      }
    }
    return g
  })
  return { request: found, groups: newGroups }
}

function extractRequest(col: Collection, requestId: string): {
  request: SavedRequest | undefined
  rootRequests: SavedRequest[]
  groups: CollectionGroup[]
} {
  const groups = col.groups ?? []
  const rootIdx = col.requests.findIndex((r) => r.id === requestId)
  if (rootIdx >= 0) {
    return {
      request: col.requests[rootIdx],
      rootRequests: col.requests.filter((r) => r.id !== requestId),
      groups,
    }
  }
  const { request, groups: newGroups } = extractRequestFromGroups(groups, requestId)
  return { request, rootRequests: col.requests, groups: newGroups }
}

function resolveVar(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([\w.-]+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

function applyEnvVars(tab: RequestTab, vars: Record<string, string>): RequestTab {
  return {
    ...tab,
    url: resolveVar(tab.url, vars),
    params: tab.params.map((p) => ({ ...p, value: resolveVar(p.value, vars) })),
    headers: tab.headers.map((h) => ({ ...h, value: resolveVar(h.value, vars) })),
    body: {
      ...tab.body,
      content: resolveVar(tab.body.content, vars),
      ...(tab.body.variables !== undefined && { variables: resolveVar(tab.body.variables, vars) }),
      ...(tab.body.fields && { fields: tab.body.fields.map((f) => ({ ...f, value: resolveVar(f.value, vars) })) }),
    },
  }
}

/** Get the active env vars for a tab (collection env + folder vars) */
function getEnvVars(state: Pick<AppState, 'collections'>, tab: RequestTab): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!tab.collectionId) return vars
  const collection = state.collections.find((c) => c.id === tab.collectionId)
  if (!collection) return vars
  const activeEnv = collection.environments?.find((e) => e.id === collection.activeEnvironmentId)
  for (const v of activeEnv?.variables ?? []) {
    if (v.enabled && v.key) vars[v.key] = v.value
  }
  if (tab.savedRequestId) {
    const group = findGroupForRequest(collection.groups ?? [], tab.savedRequestId)
    for (const v of group?.variables ?? []) {
      if (v.enabled && v.key) vars[v.key] = v.value
    }
  }
  return vars
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      collections: [],
      savedRequests: [],
      tabs: [],
      activeTabId: null,
      themeId: 'shout-dark',
      globalProxy: null,

      setThemeId: (id) => set({ themeId: id }),
      setGlobalProxy: (config) => set({ globalProxy: config }),

      addCollection: (name, description) => {
        const collection: Collection = {
          id: crypto.randomUUID(),
          name,
          description,
          requests: [],
          groups: [],
          environments: [],
          activeEnvironmentId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ collections: [...s.collections, collection] }))
        return collection
      },

      updateCollection: (id, updates) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
          ),
        }))
      },

      deleteCollection: (id) => {
        set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }))
      },

      updateCollectionProxy: (collectionId, proxy) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, proxy, updatedAt: Date.now() } : c
          ),
        }))
      },

      addSavedRequest: (collectionId, request) => {
        const saved: SavedRequest = {
          ...request,
          id: crypto.randomUUID(),
          collectionId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: [...c.requests, saved], updatedAt: Date.now() }
              : c
          ),
        }))
      },

      deleteSavedRequest: (collectionId, requestId) => {
        const removeReq = (groups: CollectionGroup[]): CollectionGroup[] =>
          groups.map((g) => ({
            ...g,
            requests: g.requests.filter((r) => r.id !== requestId),
            groups: g.groups?.length ? removeReq(g.groups) : g.groups,
          }))
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            return {
              ...c,
              requests: c.requests.filter((r) => r.id !== requestId),
              groups: removeReq(c.groups ?? []),
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      saveTabToRoot: (tabId, name) => {
        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        const saved: SavedRequest = {
          id: tab?.savedRequestId ?? crypto.randomUUID(),
          name,
          collectionId: '',
          method: tab?.method ?? 'GET',
          url: tab?.url ?? '',
          headers: tab?.headers ?? [],
          params: tab?.params ?? [],
          body: tab?.body ?? { type: 'none', content: '' },
          auth: tab?.auth ?? { type: 'none' },
          description: tab?.description,
          extractions: tab?.extractions,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({
          savedRequests: s.savedRequests.some((r) => r.id === saved.id)
            ? s.savedRequests.map((r) => (r.id === saved.id ? saved : r))
            : [...s.savedRequests, saved],
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, name, savedRequestId: saved.id, collectionId: '', isDirty: false } : t
          ),
        }))
        return saved
      },

      deleteRootRequest: (id) => {
        set((s) => ({ savedRequests: s.savedRequests.filter((r) => r.id !== id) }))
      },

      moveRequestsToRoot: (collectionId, requestIds) => {
        const state = get()
        const col = state.collections.find((c) => c.id === collectionId)
        if (!col) return
        const moved: SavedRequest[] = []
        let updatedCol = col
        for (const reqId of requestIds) {
          const { request, rootRequests, groups } = extractRequest(updatedCol, reqId)
          if (request) {
            moved.push({ ...request, collectionId: '' })
            updatedCol = { ...updatedCol, requests: rootRequests, groups, updatedAt: Date.now() }
          }
        }
        if (moved.length === 0) return
        set((s) => ({
          collections: s.collections.map((c) => (c.id === collectionId ? updatedCol : c)),
          savedRequests: [...s.savedRequests, ...moved],
        }))
      },

      moveSavedRequestsToCollection: (requestIds, collectionId, groupId) => {
        const state = get()
        const toMove = state.savedRequests.filter((r) => requestIds.includes(r.id))
        if (toMove.length === 0) return
        const updated = toMove.map((r) => ({ ...r, collectionId }))
        set((s) => ({
          savedRequests: s.savedRequests.filter((r) => !requestIds.includes(r.id)),
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            if (groupId) {
              return {
                ...c,
                groups: (c.groups ?? []).map((g) =>
                  g.id === groupId ? { ...g, requests: [...g.requests, ...updated] } : g
                ),
                updatedAt: Date.now(),
              }
            }
            return { ...c, requests: [...c.requests, ...updated], updatedAt: Date.now() }
          }),
        }))
      },

      addGroup: (collectionId, name) => {
        const group: CollectionGroup = { id: crypto.randomUUID(), name, requests: [] }
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, groups: [...(c.groups ?? []), group], updatedAt: Date.now() }
              : c
          ),
        }))
        return group
      },

      deleteGroup: (collectionId, groupId) => {
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            const rescued = collectAllRequests(c.groups ?? [], groupId)
            return {
              ...c,
              requests: [...c.requests, ...rescued],
              groups: removeGroupById(c.groups ?? [], groupId),
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      renameGroup: (collectionId, groupId, name) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  groups: mapGroupById(c.groups ?? [], groupId, (g) => ({ ...g, name })),
                  updatedAt: Date.now(),
                }
              : c
          ),
        }))
      },

      addSubGroup: (collectionId, parentGroupId, name) => {
        const sub: CollectionGroup = { id: crypto.randomUUID(), name, requests: [], groups: [] }
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id !== collectionId ? c : {
              ...c,
              groups: mapGroupById(c.groups ?? [], parentGroupId, (g) => ({
                ...g,
                groups: [...(g.groups ?? []), sub],
              })),
              updatedAt: Date.now(),
            }
          ),
        }))
        return sub
      },

      updateGroupVariables: (collectionId, groupId, variables) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id !== collectionId ? c : {
              ...c,
              groups: mapGroupById(c.groups ?? [], groupId, (g) => ({ ...g, variables })),
              updatedAt: Date.now(),
            }
          ),
        }))
      },

      updateGroupAuth: (collectionId, groupId, auth) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id !== collectionId ? c : {
              ...c,
              groups: mapGroupById(c.groups ?? [], groupId, (g) => ({ ...g, auth })),
              updatedAt: Date.now(),
            }
          ),
        }))
      },

      updateCollectionAuth: (collectionId, auth) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, auth, updatedAt: Date.now() } : c
          ),
        }))
      },

      moveRequestToGroup: (collectionId, requestId, groupId) => {
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            const { request, rootRequests, groups } = extractRequest(c, requestId)
            if (!request) return c
            if (groupId === null) {
              return { ...c, requests: [...rootRequests, request], groups, updatedAt: Date.now() }
            }
            return {
              ...c,
              requests: rootRequests,
              groups: insertRequestIntoGroup(groups, groupId, request),
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      moveRequestsToGroup: (collectionId, requestIds, groupId) => {
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            const idSet = new Set(requestIds)
            const moved: SavedRequest[] = []
            const newRoot = c.requests.filter((r) => {
              if (idSet.has(r.id)) { moved.push(r); return false }
              return true
            })
            const extractMoved = (groups: CollectionGroup[]): CollectionGroup[] =>
              groups.map((g) => ({
                ...g,
                requests: g.requests.filter((r) => {
                  if (idSet.has(r.id)) { moved.push(r); return false }
                  return true
                }),
                groups: g.groups?.length ? extractMoved(g.groups) : g.groups,
              }))
            const newGroups = extractMoved(c.groups ?? [])
            if (groupId === null) {
              return { ...c, requests: [...newRoot, ...moved], groups: newGroups, updatedAt: Date.now() }
            }
            return {
              ...c,
              requests: newRoot,
              groups: insertRequestsIntoGroup(newGroups, groupId, moved),
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      addEnvironment: (collectionId, name) => {
        const env: Environment = { id: crypto.randomUUID(), name, variables: [] }
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, environments: [...(c.environments ?? []), env], updatedAt: Date.now() }
              : c
          ),
        }))
        return env
      },

      deleteEnvironment: (collectionId, envId) => {
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            return {
              ...c,
              environments: (c.environments ?? []).filter((e) => e.id !== envId),
              activeEnvironmentId: c.activeEnvironmentId === envId ? null : c.activeEnvironmentId,
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      renameEnvironment: (collectionId, envId, name) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id !== collectionId ? c : {
              ...c,
              environments: (c.environments ?? []).map((e) => e.id === envId ? { ...e, name } : e),
              updatedAt: Date.now(),
            }
          ),
        }))
      },

      setActiveEnvironment: (collectionId, envId) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, activeEnvironmentId: envId, updatedAt: Date.now() } : c
          ),
        }))
      },

      updateEnvironmentVariables: (collectionId, envId, variables) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id !== collectionId ? c : {
              ...c,
              environments: (c.environments ?? []).map((e) => e.id === envId ? { ...e, variables } : e),
              updatedAt: Date.now(),
            }
          ),
        }))
      },

      openTab: (partial) => {
        const tab = newTab(partial)
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      },

      openSavedRequest: (request) => {
        const state = get()
        const existing = state.tabs.find((t) => t.savedRequestId === request.id)
        if (existing) { set({ activeTabId: existing.id }); return }
        const tab = newTab({
          name: request.name,
          savedRequestId: request.id,
          collectionId: request.collectionId,
          method: request.method,
          url: request.url,
          headers: request.headers,
          params: request.params,
          body: request.body,
          auth: request.auth,
          description: request.description,
          extractions: request.extractions,
          isDirty: false,
        })
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      },

      closeTab: (id) => {
        // Clean up any active connections
        wsUnlisteners.get(id)?.()
        wsUnlisteners.delete(id)
        sseUnlisteners.get(id)?.()
        sseUnlisteners.delete(id)
        streamUnlisteners.get(id)?.()
        streamUnlisteners.delete(id)

        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id)
          const newTabs = s.tabs.filter((t) => t.id !== id)
          let newActiveId = s.activeTabId
          if (s.activeTabId === id) {
            newActiveId = newTabs.length === 0 ? null : (newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0].id)
          }
          return { tabs: newTabs, activeTabId: newActiveId }
        })
      },

      closeOtherTabs: (id) => {
        set((s) => {
          const tab = s.tabs.find((t) => t.id === id)
          if (!tab) return s
          return { tabs: [tab], activeTabId: id }
        })
      },

      closeTabsToRight: (id) => {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id)
          if (idx < 0) return s
          const newTabs = s.tabs.slice(0, idx + 1)
          const activeStillExists = newTabs.some((t) => t.id === s.activeTabId)
          return { tabs: newTabs, activeTabId: activeStillExists ? s.activeTabId : id }
        })
      },

      closeAllTabs: () => set({ tabs: [], activeTabId: null }),

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTab: (id, updates) => {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates, isDirty: true } : t)),
        }))
      },

      saveTabToCollection: (tabId, collectionId, name) => {
        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab) return
        const saved: SavedRequest = {
          id: tab.savedRequestId ?? crypto.randomUUID(),
          name,
          collectionId,
          method: tab.method,
          url: tab.url,
          headers: tab.headers,
          params: tab.params,
          body: tab.body,
          auth: tab.auth,
          description: tab.description,
          extractions: tab.extractions,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            const existingIdx = c.requests.findIndex((r) => r.id === saved.id)
            const requests =
              existingIdx >= 0
                ? c.requests.map((r) => (r.id === saved.id ? saved : r))
                : [...c.requests, saved]
            const groups = (c.groups ?? []).map((g) => ({
              ...g,
              requests: g.requests.map((r) => (r.id === saved.id ? saved : r)),
            }))
            return { ...c, requests, groups, updatedAt: Date.now() }
          }),
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, name, savedRequestId: saved.id, collectionId, isDirty: false } : t
          ),
        }))
      },

      sendRequest: async (tabId) => {
        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab || !tab.url) return

        let resolvedTab = tab
        if (tab.collectionId) {
          const collection = state.collections.find((c) => c.id === tab.collectionId)
          if (collection) {
            const vars = getEnvVars(state, tab)
            resolvedTab = applyEnvVars(tab, vars)

            // Auth inheritance
            if (resolvedTab.auth.type === 'inherit') {
              let resolvedAuth = resolvedTab.auth
              if (tab.savedRequestId) {
                const group = findGroupForRequest(collection.groups ?? [], tab.savedRequestId)
                if (group?.auth && group.auth.type !== 'none' && group.auth.type !== 'inherit') {
                  resolvedAuth = group.auth
                } else if (collection.auth && collection.auth.type !== 'none' && collection.auth.type !== 'inherit') {
                  resolvedAuth = collection.auth
                } else {
                  resolvedAuth = { type: 'none' }
                }
              }
              resolvedTab = { ...resolvedTab, auth: resolvedAuth }
            }

            // Cookie injection
            if (tab.sendCookies && collection.cookieJar) {
              const cookies = cookiesForRequest(collection.cookieJar, resolvedTab.url)
              if (cookies.length > 0) {
                const cookieHeader = formatCookieHeader(cookies)
                const existingCookie = resolvedTab.headers.find((h) => h.key.toLowerCase() === 'cookie')
                if (existingCookie) {
                  resolvedTab = {
                    ...resolvedTab,
                    headers: resolvedTab.headers.map((h) =>
                      h.key.toLowerCase() === 'cookie'
                        ? { ...h, value: `${h.value}; ${cookieHeader}` }
                        : h
                    ),
                  }
                } else {
                  resolvedTab = {
                    ...resolvedTab,
                    headers: [
                      ...resolvedTab.headers,
                      { id: 'auto-cookie', key: 'Cookie', value: cookieHeader, enabled: true },
                    ],
                  }
                }
              }
            }
          }
        }

        // Determine effective proxy: collection proxy overrides global
        const collection = tab.collectionId
          ? state.collections.find((c) => c.id === tab.collectionId)
          : null
        const proxy = collection?.proxy ?? state.globalProxy ?? null

        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, isLoading: true, error: undefined, response: undefined, streamChunks: [], streamComplete: false }
              : t
          ),
        }))

        try {
          const response = await makeRequest(resolvedTab, proxy ?? undefined)
          set((s) => {
            const currentTab = s.tabs.find((t) => t.id === tabId)
            const historic: HistoricResponse = { ...response, id: crypto.randomUUID(), sentAt: Date.now() }
            let newCollections = s.collections
            let newSavedRequests = s.savedRequests

            // Save response history
            if (currentTab?.savedRequestId) {
              const reqId = currentTab.savedRequestId
              if (currentTab.collectionId) {
                newCollections = s.collections.map((c) => ({
                  ...c,
                  requests: c.requests.map((r) => r.id === reqId ? appendHistory(r, historic) : r),
                  groups: (c.groups ?? []).map((g) => ({
                    ...g,
                    requests: g.requests.map((r) => r.id === reqId ? appendHistory(r, historic) : r),
                  })),
                }))
              } else {
                newSavedRequests = s.savedRequests.map((r) => r.id === reqId ? appendHistory(r, historic) : r)
              }
            }

            // Parse Set-Cookie headers
            if (currentTab?.collectionId) {
              const setCookieHeaders: string[] = []
              for (const [k, v] of Object.entries(response.headers)) {
                if (k.toLowerCase() === 'set-cookie') setCookieHeaders.push(v)
              }
              if (setCookieHeaders.length > 0) {
                const newCookies = setCookieHeaders
                  .map((h) => parseSetCookieHeader(h, resolvedTab.url))
                  .filter((c): c is Cookie => c !== null)
                if (newCookies.length > 0) {
                  const colId = currentTab.collectionId
                  newCollections = newCollections.map((c) => {
                    if (c.id !== colId) return c
                    const jar = c.cookieJar ?? { cookies: [] }
                    return { ...c, cookieJar: mergeCookies(jar, newCookies) }
                  })
                }
              }
            }

            // Run extractions
            if (currentTab?.collectionId && currentTab.extractions?.length) {
              const extracted = runExtractions(response, currentTab.extractions)
              if (Object.keys(extracted).length > 0) {
                const colId = currentTab.collectionId
                newCollections = newCollections.map((c) => {
                  if (c.id !== colId) return c
                  const activeEnv = c.environments?.find((e) => e.id === c.activeEnvironmentId)
                  if (!activeEnv) return c
                  const updatedVars = activeEnv.variables.map((v) => {
                    if (v.key in extracted) return { ...v, value: extracted[v.key] }
                    return v
                  })
                  // Add vars that don't exist yet
                  for (const [key, value] of Object.entries(extracted)) {
                    if (!updatedVars.some((v) => v.key === key)) {
                      updatedVars.push({ id: crypto.randomUUID(), key, value, enabled: true })
                    }
                  }
                  return {
                    ...c,
                    environments: c.environments?.map((e) =>
                      e.id === activeEnv.id ? { ...e, variables: updatedVars } : e
                    ),
                  }
                })
              }
            }

            return {
              tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, isLoading: false, response } : t)),
              collections: newCollections,
              savedRequests: newSavedRequests,
            }
          })
        } catch (err) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, isLoading: false, error: String(err) } : t
            ),
          }))
        }
      },

      clearResponseHistory: (requestId) => {
        set((s) => ({
          collections: s.collections.map((c) => ({
            ...c,
            requests: c.requests.map((r) => r.id === requestId ? { ...r, responseHistory: [] } : r),
            groups: (c.groups ?? []).map((g) => ({
              ...g,
              requests: g.requests.map((r) => r.id === requestId ? { ...r, responseHistory: [] } : r),
            })),
          })),
          savedRequests: s.savedRequests.map((r) => r.id === requestId ? { ...r, responseHistory: [] } : r),
        }))
      },

      // ── WebSocket ──────────────────────────────────────────────────────────

      connectWs: async (tabId) => {
        if (!isTauri) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, wsStatus: 'error', error: 'WebSocket requires the desktop app' } : t
            ),
          }))
          return
        }

        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Clean up existing connection
        wsUnlisteners.get(tabId)?.()
        wsUnlisteners.delete(tabId)

        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, wsStatus: 'connecting', wsMessages: [], error: undefined } : t
          ),
        }))

        try {
          const { invoke, listen } = await import('@tauri-apps/api/core').then(
            async (core) => ({ invoke: core.invoke, listen: (await import('@tauri-apps/api/event')).listen })
          )

          const vars = getEnvVars(state, tab)
          const resolvedTab = applyEnvVars(tab, vars)
          const headers: Record<string, string> = {}
          for (const h of resolvedTab.headers) {
            if (h.enabled && h.key) headers[h.key] = h.value
          }

          // Set up event listeners before connecting
          const unlistenOpen = await listen<{ tabId: string }>('ws-open', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) => t.id === tabId ? { ...t, wsStatus: 'open' } : t),
            }))
          })
          const unlistenMsg = await listen<{ tabId: string; data: string }>('ws-message', (e) => {
            if (e.payload.tabId !== tabId) return
            const msg: WsMessage = {
              id: crypto.randomUUID(),
              direction: 'received',
              data: e.payload.data,
              ts: Date.now(),
            }
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId ? { ...t, wsMessages: [...(t.wsMessages ?? []), msg] } : t
              ),
            }))
          })
          const unlistenClose = await listen<{ tabId: string }>('ws-close', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) => t.id === tabId ? { ...t, wsStatus: 'closed' } : t),
            }))
            wsUnlisteners.get(tabId)?.()
            wsUnlisteners.delete(tabId)
          })
          const unlistenError = await listen<{ tabId: string; error: string }>('ws-error', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId ? { ...t, wsStatus: 'error', error: e.payload.error } : t
              ),
            }))
          })

          wsUnlisteners.set(tabId, () => {
            unlistenOpen()
            unlistenMsg()
            unlistenClose()
            unlistenError()
          })

          await invoke('ws_connect', { tabId, url: resolvedTab.url, headers })
        } catch (err) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, wsStatus: 'error', error: String(err) } : t
            ),
          }))
        }
      },

      disconnectWs: async (tabId) => {
        if (!isTauri) return
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('ws_disconnect', { tabId })
        } catch { /* ignore */ }
        wsUnlisteners.get(tabId)?.()
        wsUnlisteners.delete(tabId)
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === tabId ? { ...t, wsStatus: 'closed' } : t),
        }))
      },

      sendWsMessage: async (tabId, data) => {
        if (!isTauri) return
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('ws_send', { tabId, data })
          const msg: WsMessage = {
            id: crypto.randomUUID(),
            direction: 'sent',
            data,
            ts: Date.now(),
          }
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, wsMessages: [...(t.wsMessages ?? []), msg] } : t
            ),
          }))
        } catch (err) {
          console.error('WS send error:', err)
        }
      },

      // ── SSE ──────────────────────────────────────────────────────────────

      connectSse: async (tabId) => {
        if (!isTauri) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, sseStatus: 'error', error: 'SSE requires the desktop app' } : t
            ),
          }))
          return
        }

        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab) return

        sseUnlisteners.get(tabId)?.()
        sseUnlisteners.delete(tabId)

        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, sseStatus: 'connecting', sseEvents: [], error: undefined } : t
          ),
        }))

        try {
          const { invoke, listen } = await import('@tauri-apps/api/core').then(
            async (core) => ({ invoke: core.invoke, listen: (await import('@tauri-apps/api/event')).listen })
          )

          const vars = getEnvVars(state, tab)
          const resolvedTab = applyEnvVars(tab, vars)
          const headers: Record<string, string> = {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          }
          for (const h of resolvedTab.headers) {
            if (h.enabled && h.key) headers[h.key] = h.value
          }

          const unlistenOpen = await listen<{ tabId: string }>('sse-open', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) => t.id === tabId ? { ...t, sseStatus: 'open' } : t),
            }))
          })
          const unlistenEvent = await listen<{ tabId: string; id?: string; eventType: string; data: string }>('sse-event', (e) => {
            if (e.payload.tabId !== tabId) return
            const ev: SseEvent = {
              id: e.payload.id,
              eventType: e.payload.eventType || 'message',
              data: e.payload.data,
              ts: Date.now(),
            }
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId ? { ...t, sseEvents: [...(t.sseEvents ?? []), ev] } : t
              ),
            }))
          })
          const unlistenClose = await listen<{ tabId: string }>('sse-close', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) => t.id === tabId ? { ...t, sseStatus: 'closed' } : t),
            }))
            sseUnlisteners.get(tabId)?.()
            sseUnlisteners.delete(tabId)
          })
          const unlistenError = await listen<{ tabId: string; error: string }>('sse-error', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId ? { ...t, sseStatus: 'error', error: e.payload.error } : t
              ),
            }))
          })

          sseUnlisteners.set(tabId, () => {
            unlistenOpen()
            unlistenEvent()
            unlistenClose()
            unlistenError()
          })

          await invoke('sse_connect', { tabId, url: resolvedTab.url, headers })
        } catch (err) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, sseStatus: 'error', error: String(err) } : t
            ),
          }))
        }
      },

      disconnectSse: async (tabId) => {
        if (!isTauri) return
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('sse_disconnect', { tabId })
        } catch { /* ignore */ }
        sseUnlisteners.get(tabId)?.()
        sseUnlisteners.delete(tabId)
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === tabId ? { ...t, sseStatus: 'closed' } : t),
        }))
      },

      // ── Streaming ─────────────────────────────────────────────────────────

      startStreamRequest: async (tabId) => {
        if (!isTauri) {
          // Browser fallback: use sendRequest
          return get().sendRequest(tabId)
        }

        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab || !tab.url) return

        streamUnlisteners.get(tabId)?.()
        streamUnlisteners.delete(tabId)

        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, isLoading: true, error: undefined, response: undefined, streamChunks: [], streamComplete: false }
              : t
          ),
        }))

        try {
          const { invoke, listen } = await import('@tauri-apps/api/core').then(
            async (core) => ({ invoke: core.invoke, listen: (await import('@tauri-apps/api/event')).listen })
          )

          const vars = getEnvVars(state, tab)
          const resolvedTab = applyEnvVars(tab, vars)

          const unlistenChunk = await listen<{ tabId: string; chunk: string }>('stream-chunk', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId ? { ...t, streamChunks: [...(t.streamChunks ?? []), e.payload.chunk] } : t
              ),
            }))
          })
          const unlistenDone = await listen<{
            tabId: string; status: number; statusText: string
            headers: Record<string, string>; size: number; time: number
          }>('stream-done', (e) => {
            if (e.payload.tabId !== tabId) return
            const s2 = get()
            const t = s2.tabs.find((x) => x.id === tabId)
            const body = (t?.streamChunks ?? []).join('')
            const response: ResponseData = {
              status: e.payload.status,
              statusText: e.payload.statusText,
              headers: e.payload.headers,
              body,
              bodyEncoding: 'utf8',
              size: e.payload.size,
              time: e.payload.time,
              contentType: e.payload.headers['content-type'],
            }
            set((ss) => ({
              tabs: ss.tabs.map((tx) =>
                tx.id === tabId ? { ...tx, isLoading: false, response, streamComplete: true } : tx
              ),
            }))
            streamUnlisteners.get(tabId)?.()
            streamUnlisteners.delete(tabId)
          })
          const unlistenError = await listen<{ tabId: string; error: string }>('stream-error', (e) => {
            if (e.payload.tabId !== tabId) return
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId ? { ...t, isLoading: false, error: e.payload.error, streamComplete: false } : t
              ),
            }))
            streamUnlisteners.get(tabId)?.()
            streamUnlisteners.delete(tabId)
          })

          streamUnlisteners.set(tabId, () => {
            unlistenChunk()
            unlistenDone()
            unlistenError()
          })

          const headers: Record<string, string> = {}
          for (const h of resolvedTab.headers) {
            if (h.enabled && h.key) headers[h.key] = h.value
          }

          await invoke('stream_request', {
            tabId,
            method: resolvedTab.method,
            url: resolvedTab.url,
            headers,
            body: resolvedTab.body.content || null,
          })
        } catch (err) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, isLoading: false, error: String(err) } : t
            ),
          }))
        }
      },

      cancelStream: async (tabId) => {
        if (!isTauri) return
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('cancel_stream', { tabId })
        } catch { /* ignore */ }
        streamUnlisteners.get(tabId)?.()
        streamUnlisteners.delete(tabId)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, isLoading: false, streamComplete: false } : t
          ),
        }))
      },

      // ── Cookies ───────────────────────────────────────────────────────────

      updateCookieJar: (collectionId, jar) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, cookieJar: jar, updatedAt: Date.now() } : c
          ),
        }))
      },

      deleteCookie: (collectionId, cookieId) => {
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            return {
              ...c,
              cookieJar: { cookies: (c.cookieJar?.cookies ?? []).filter((k) => k.id !== cookieId) },
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      clearCookies: (collectionId) => {
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId ? { ...c, cookieJar: { cookies: [] }, updatedAt: Date.now() } : c
          ),
        }))
      },

      // ── Extractions ───────────────────────────────────────────────────────

      updateRequestExtractions: (collectionId, requestId, extractions) => {
        const updateReq = (req: SavedRequest) =>
          req.id === requestId ? { ...req, extractions, updatedAt: Date.now() } : req
        const updateGroups = (groups: CollectionGroup[]): CollectionGroup[] =>
          groups.map((g) => ({
            ...g,
            requests: g.requests.map(updateReq),
            groups: g.groups?.length ? updateGroups(g.groups) : g.groups,
          }))
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id !== collectionId ? c : {
              ...c,
              requests: c.requests.map(updateReq),
              groups: updateGroups(c.groups ?? []),
              updatedAt: Date.now(),
            }
          ),
        }))
      },

      // ── OAuth2 ────────────────────────────────────────────────────────────

      fetchOAuth2Token: async (tabId) => {
        const state = get()
        const tab = state.tabs.find((t) => t.id === tabId)
        if (!tab) return

        const oauth2 = tab.auth.oauth2
        if (!oauth2) return

        try {
          if (isTauri) {
            const { invoke } = await import('@tauri-apps/api/core')
            const result = await invoke<{ access_token: string; expires_in?: number; refresh_token?: string }>(
              'oauth2_client_credentials',
              {
                tokenUrl: oauth2.tokenUrl,
                clientId: oauth2.clientId,
                clientSecret: oauth2.clientSecret,
                scope: oauth2.scope || null,
              }
            )
            const expiry = result.expires_in
              ? Math.floor(Date.now() / 1000) + result.expires_in
              : undefined
            const updatedOAuth2: OAuth2Config = {
              ...oauth2,
              accessToken: result.access_token,
              refreshToken: result.refresh_token,
              tokenExpiry: expiry,
            }
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId
                  ? { ...t, auth: { ...t.auth, oauth2: updatedOAuth2 }, isDirty: true }
                  : t
              ),
            }))
          } else {
            // Browser fallback
            const params = new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: oauth2.clientId,
              client_secret: oauth2.clientSecret,
              ...(oauth2.scope ? { scope: oauth2.scope } : {}),
            })
            const res = await fetch(oauth2.tokenUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            })
            const data = await res.json()
            const expiry = data.expires_in
              ? Math.floor(Date.now() / 1000) + data.expires_in
              : undefined
            const updatedOAuth2: OAuth2Config = {
              ...oauth2,
              accessToken: data.access_token,
              tokenExpiry: expiry,
            }
            set((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tabId
                  ? { ...t, auth: { ...t.auth, oauth2: updatedOAuth2 }, isDirty: true }
                  : t
              ),
            }))
          }
        } catch (err) {
          console.error('OAuth2 token fetch failed:', err)
          throw err
        }
      },
    }),
    {
      name: 'shout-storage',
      partialize: (state) => ({
        collections: state.collections,
        savedRequests: state.savedRequests,
        tabs: state.tabs.map((t) => ({
          ...t,
          isLoading: false,
          wsStatus: 'idle' as const,
          wsMessages: [],
          sseStatus: 'idle' as const,
          sseEvents: [],
          streamChunks: [],
          streamComplete: false,
        })),
        activeTabId: state.activeTabId,
        themeId: state.themeId,
        globalProxy: state.globalProxy,
      }),
    }
  )
)

export const useActiveTab = () => {
  const { tabs, activeTabId } = useStore()
  return tabs.find((t) => t.id === activeTabId) ?? null
}

export const useTabField = <K extends keyof RequestTab>(
  tabId: string,
  field: K
): RequestTab[K] | undefined => {
  return useStore((s) => s.tabs.find((t) => t.id === tabId)?.[field])
}

export type { HttpMethod, KeyValue, RequestBody, Auth, ResponseData }
