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
  SavedRequest,
} from '../types'
import { newTab } from '../types'
import { makeRequest } from '../utils/http'

interface AppState {
  collections: Collection[]
  savedRequests: SavedRequest[]   // requests not in any collection
  tabs: RequestTab[]
  activeTabId: string | null

  // Collection actions
  addCollection: (name: string, description?: string) => Collection
  updateCollection: (id: string, updates: Partial<Pick<Collection, 'name' | 'description'>>) => void
  deleteCollection: (id: string) => void
  addSavedRequest: (collectionId: string, request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) => void
  deleteSavedRequest: (collectionId: string, requestId: string) => void

  // Root-level saved requests (not in any collection)
  saveTabToRoot: (tabId: string, name: string) => SavedRequest
  deleteRootRequest: (id: string) => void
  moveRequestsToRoot: (collectionId: string, requestIds: string[]) => void
  moveSavedRequestsToCollection: (requestIds: string[], collectionId: string, groupId: string | null) => void

  // Group actions
  addGroup: (collectionId: string, name: string) => CollectionGroup
  deleteGroup: (collectionId: string, groupId: string) => void
  renameGroup: (collectionId: string, groupId: string, name: string) => void
  moveRequestToGroup: (collectionId: string, requestId: string, groupId: string | null) => void
  moveRequestsToGroup: (collectionId: string, requestIds: string[], groupId: string | null) => void

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
}

// Pull a request out of any location in a collection
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
  let found: SavedRequest | undefined
  const newGroups = groups.map((g) => {
    const idx = g.requests.findIndex((r) => r.id === requestId)
    if (idx >= 0) {
      found = g.requests[idx]
      return { ...g, requests: g.requests.filter((r) => r.id !== requestId) }
    }
    return g
  })
  return { request: found, rootRequests: col.requests, groups: newGroups }
}

// Resolve {{variable}} placeholders in a tab using an environment's variable map
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

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      collections: [],
      savedRequests: [],
      tabs: [],
      activeTabId: null,

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
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c
            return {
              ...c,
              requests: c.requests.filter((r) => r.id !== requestId),
              groups: (c.groups ?? []).map((g) => ({
                ...g,
                requests: g.requests.filter((r) => r.id !== requestId),
              })),
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
        const group: CollectionGroup = {
          id: crypto.randomUUID(),
          name,
          requests: [],
        }
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
            const group = (c.groups ?? []).find((g) => g.id === groupId)
            // Move group's requests back to root before deleting
            const rescued = group?.requests ?? []
            return {
              ...c,
              requests: [...c.requests, ...rescued],
              groups: (c.groups ?? []).filter((g) => g.id !== groupId),
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
                  groups: (c.groups ?? []).map((g) =>
                    g.id === groupId ? { ...g, name } : g
                  ),
                  updatedAt: Date.now(),
                }
              : c
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
              groups: groups.map((g) =>
                g.id === groupId ? { ...g, requests: [...g.requests, request] } : g
              ),
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
            const newGroups = (c.groups ?? []).map((g) => ({
              ...g,
              requests: g.requests.filter((r) => {
                if (idSet.has(r.id)) { moved.push(r); return false }
                return true
              }),
            }))
            if (groupId === null) {
              return { ...c, requests: [...newRoot, ...moved], groups: newGroups, updatedAt: Date.now() }
            }
            return {
              ...c,
              requests: newRoot,
              groups: newGroups.map((g) =>
                g.id === groupId ? { ...g, requests: [...g.requests, ...moved] } : g
              ),
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
          isDirty: false,
        })
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      },

      closeTab: (id) => {
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
            // Also check inside groups
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

        // Resolve environment variables before sending
        let resolvedTab = tab
        if (tab.collectionId) {
          const collection = state.collections.find((c) => c.id === tab.collectionId)
          const activeEnv = collection?.environments?.find((e) => e.id === collection.activeEnvironmentId)
          if (activeEnv) {
            const vars: Record<string, string> = {}
            for (const v of activeEnv.variables) {
              if (v.enabled && v.key) vars[v.key] = v.value
            }
            resolvedTab = applyEnvVars(tab, vars)
          }
        }

        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, isLoading: true, error: undefined, response: undefined } : t
          ),
        }))
        try {
          const response = await makeRequest(resolvedTab)
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, isLoading: false, response } : t)),
          }))
        } catch (err) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId ? { ...t, isLoading: false, error: String(err) } : t
            ),
          }))
        }
      },
    }),
    {
      name: 'shout-storage',
      partialize: (state) => ({
        collections: state.collections,
        tabs: state.tabs.map((t) => ({ ...t, isLoading: false })),
        activeTabId: state.activeTabId,
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
