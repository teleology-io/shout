import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { Collection, CollectionGroup, SavedRequest } from '../types'
import { METHOD_COLORS } from '../types'
import { ImportModal } from './ImportModal'
import { EnvironmentModal } from './EnvironmentModal'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import {
  Plus, Upload, ChevronRight, Trash2, FolderOpen, Check,
  Folder, FolderPlus, Pencil, MoreHorizontal, X, FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Drag state (pointer-event based, avoids WKWebView DnD limitations) ────────

interface DragPayload {
  collectionId: string
  requestIds: string[]
}

interface DragState {
  payload: DragPayload
  startX: number
  startY: number
  active: boolean   // true once the cursor has moved > threshold
}

// data attributes used for drop-target hit testing
const ATTR_KEY = 'data-drop-key'   // "group:<id>" | "root:<colId>"
const ATTR_COL = 'data-drop-col'   // collection id

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface Props {
  onNavigate: () => void
}

export function Sidebar({ onNavigate }: Props) {
  const { collections, tabs, activeTabId, openTab, addCollection, moveRequestsToGroup } = useStore()
  const [showImport, setShowImport] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [newColName, setNewColName] = useState('')
  const [addingCol, setAddingCol] = useState(false)

  // Selection state — scoped to one collection at a time
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionColId, setSelectionColId] = useState<string | null>(null)

  // Drag state
  const dragState = useRef<DragState | null>(null)
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set())
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  // drop-target key currently under cursor, e.g. "group:<id>" or "root:<colId>"
  const [hoveredDropKey, setHoveredDropKey] = useState<string | null>(null)

  // Stable refs so the global mousemove/mouseup effect never goes stale
  const moveRequestsToGroupRef = useRef(moveRequestsToGroup)
  moveRequestsToGroupRef.current = moveRequestsToGroup

  const clearSelectionRef = useRef<() => void>(() => {})

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const handleAdd = () => {
    if (!newColName.trim()) return
    const col = addCollection(newColName.trim())
    setExpanded((p) => new Set([...p, col.id]))
    setNewColName('')
    setAddingCol(false)
  }

  const handleSelectRequest = (colId: string, reqId: string) => {
    if (selectionColId !== colId) {
      setSelectionColId(colId)
      setSelectedIds(new Set([reqId]))
    } else {
      setSelectedIds((prev) => {
        const n = new Set(prev)
        n.has(reqId) ? n.delete(reqId) : n.add(reqId)
        if (n.size === 0) setSelectionColId(null)
        return n
      })
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setSelectionColId(null)
  }
  clearSelectionRef.current = clearSelection

  // Called from RequestRow onMouseDown — stores pending drag info
  const handleDragInit = (colId: string, reqId: string, clientX: number, clientY: number) => {
    const idsToMove =
      selectionColId === colId && selectedIds.has(reqId)
        ? [...selectedIds]
        : [reqId]
    dragState.current = {
      payload: { collectionId: colId, requestIds: idsToMove },
      startX: clientX,
      startY: clientY,
      active: false,
    }
  }

  // Global pointer tracking — replaces HTML5 DnD entirely
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const state = dragState.current
      if (!state) return

      if (!state.active) {
        // Activate drag after moving > 5px
        if (Math.abs(e.clientX - state.startX) > 5 || Math.abs(e.clientY - state.startY) > 5) {
          state.active = true
          setDraggingIds(new Set(state.payload.requestIds))
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'
        } else {
          return
        }
      }

      setDragPos({ x: e.clientX, y: e.clientY })

      // Hit-test for drop target
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = el?.closest(`[${ATTR_KEY}]`)
      const key = target?.getAttribute(ATTR_KEY) ?? null
      setHoveredDropKey((prev) => (prev === key ? prev : key))
    }

    const onMouseUp = (e: MouseEvent) => {
      const state = dragState.current
      if (!state) return
      const wasActive = state.active
      dragState.current = null

      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDraggingIds(new Set())
      setDragPos(null)
      setHoveredDropKey(null)

      if (!wasActive) return

      // Find drop target under release point
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = el?.closest(`[${ATTR_KEY}]`)
      if (!target) return

      const dropKey = target.getAttribute(ATTR_KEY)
      const dropColId = target.getAttribute(ATTR_COL)
      if (!dropKey || !dropColId || dropColId !== state.payload.collectionId) return

      const targetGroupId = dropKey.startsWith('root:') ? null : dropKey.replace('group:', '')
      moveRequestsToGroupRef.current(dropColId, state.payload.requestIds, targetGroupId)
      clearSelectionRef.current()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, []) // intentionally empty — uses refs for callbacks

  const isDragging = draggingIds.size > 0

  return (
    <div className="flex flex-col w-full h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-primary font-bold text-lg tracking-tight select-none">shout</span>
        <div className="flex gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { openTab(); onNavigate() }}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New request</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import OpenAPI</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="px-2 pt-2 pb-1">
          {/* Collections label + add button */}
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Collections
            </span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setAddingCol(true)}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {/* Inline new-collection input */}
          {addingCol && (
            <div className="flex gap-1 mb-2 px-1">
              <Input
                autoFocus
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                  if (e.key === 'Escape') { setAddingCol(false); setNewColName('') }
                }}
                placeholder="Collection name"
                className="h-7 text-xs"
              />
              <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAdd}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Empty state */}
          {collections.length === 0 && !addingCol && (
            <div className="text-center py-8 px-2">
              <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-muted-foreground/50 text-xs">No collections yet</p>
              <button
                onClick={() => setShowImport(true)}
                className="text-primary/70 hover:text-primary text-xs mt-1 underline-offset-2 hover:underline"
              >
                Import an OpenAPI spec
              </button>
            </div>
          )}

          {collections.map((col) => (
            <CollectionItem
              key={col.id}
              collection={col}
              expanded={expanded.has(col.id)}
              onToggle={() => toggle(col.id)}
              expandedIds={expanded}
              onToggleId={toggle}
              onNavigate={() => { clearSelection(); onNavigate() }}
              selectedIds={selectionColId === col.id ? selectedIds : new Set<string>()}
              draggingIds={draggingIds}
              hoveredDropKey={hoveredDropKey}
              onSelectRequest={(reqId) => handleSelectRequest(col.id, reqId)}
              onDragInit={(reqId, x, y) => handleDragInit(col.id, reqId, x, y)}
            />
          ))}
        </div>

        {/* Open tabs */}
        {tabs.length > 0 && (
          <>
            <Separator className="mx-2 my-1 w-auto" />
            <div className="px-2 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 block mb-1">
                Open Tabs
              </span>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { useStore.getState().setActiveTab(tab.id); onNavigate() }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors',
                    tab.id === activeTabId
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <span className="font-bold text-[10px] w-11 text-right shrink-0" style={{ color: METHOD_COLORS[tab.method] }}>
                    {tab.method}
                  </span>
                  <span className="truncate">{tab.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border px-2 py-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-2 text-muted-foreground justify-start text-xs"
          onClick={() => setShowImport(true)}
        >
          <Upload className="h-3.5 w-3.5" />
          Import OpenAPI
        </Button>
      </div>

      {/* Drag ghost — follows cursor */}
      {isDragging && dragPos && (
        <div
          className="fixed z-[200] pointer-events-none px-2 py-1 rounded-md bg-primary/20 border border-primary/40 text-primary text-[11px] font-medium shadow-lg"
          style={{ left: dragPos.x + 14, top: dragPos.y + 4 }}
        >
          {draggingIds.size} request{draggingIds.size > 1 ? 's' : ''}
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

// ── Collection item ───────────────────────────────────────────────────────────

interface CollectionItemProps {
  collection: Collection
  expanded: boolean
  onToggle: () => void
  expandedIds: Set<string>
  onToggleId: (id: string) => void
  onNavigate: () => void
  selectedIds: Set<string>
  draggingIds: Set<string>
  hoveredDropKey: string | null
  onSelectRequest: (reqId: string) => void
  onDragInit: (reqId: string, x: number, y: number) => void
}

function CollectionItem(props: CollectionItemProps) {
  const { collection, expanded, onToggle, expandedIds, onToggleId, onNavigate,
          selectedIds, draggingIds, hoveredDropKey, onSelectRequest, onDragInit } = props
  const { openSavedRequest, deleteCollection, deleteSavedRequest, addGroup, deleteGroup, renameGroup, moveRequestToGroup } = useStore()
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renamingGroupName, setRenamingGroupName] = useState('')
  const [showEnvModal, setShowEnvModal] = useState(false)

  const groups = collection.groups ?? []
  const activeEnv = (collection.environments ?? []).find((e) => e.id === collection.activeEnvironmentId) ?? null
  const totalCount = collection.requests.length + groups.reduce((s, g) => s + g.requests.length, 0)
  const isDragging = draggingIds.size > 0
  const rootDropKey = `root:${collection.id}`

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return
    const g = addGroup(collection.id, newGroupName.trim())
    onToggleId(g.id)
    setNewGroupName('')
    setAddingGroup(false)
  }

  const handleRenameGroup = () => {
    if (!renamingGroupId || !renamingGroupName.trim()) { setRenamingGroupId(null); return }
    renameGroup(collection.id, renamingGroupId, renamingGroupName.trim())
    setRenamingGroupId(null)
  }

  return (
    <div className="mb-0.5">
      {/* Collection header row */}
      <div
        className="group flex items-center gap-1 px-1 py-1.5 rounded-md hover:bg-accent cursor-pointer"
        onClick={onToggle}
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
        />
        <span className="text-xs font-medium text-foreground flex-1 truncate">{collection.name}</span>
        <span className="text-[10px] text-muted-foreground/40 mr-0.5">{totalCount}</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); setShowEnvModal(true) }}
              className={cn(
                'p-0.5 rounded transition-opacity hover:text-foreground',
                activeEnv ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
              )}
              aria-label="Environments"
            >
              <FlaskConical className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{activeEnv ? `Env: ${activeEnv.name}` : 'Environments'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); setAddingGroup(true); if (!expanded) onToggle() }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:text-foreground text-muted-foreground"
              aria-label="Add group"
            >
              <FolderPlus className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>New group</TooltipContent>
        </Tooltip>

        <button
          onClick={(e) => { e.stopPropagation(); deleteCollection(collection.id) }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:text-destructive text-muted-foreground"
          aria-label="Delete collection"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {showEnvModal && (
        <EnvironmentModal collection={collection} onClose={() => setShowEnvModal(false)} />
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="ml-3.5 border-l border-border pl-2 my-0.5">
          {/* Inline add-group input */}
          {addingGroup && (
            <div className="flex gap-1 mb-1 pr-1">
              <Input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddGroup()
                  if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                }}
                placeholder="Group name…"
                className="h-6 text-xs py-0"
              />
              <button onClick={handleAddGroup} className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => { setAddingGroup(false); setNewGroupName('') }} className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => (
            <GroupFolder
              key={group.id}
              group={group}
              collectionId={collection.id}
              expanded={expandedIds.has(group.id)}
              onToggle={() => onToggleId(group.id)}
              renamingGroupId={renamingGroupId}
              renamingGroupName={renamingGroupName}
              onStartRename={(id, name) => { setRenamingGroupId(id); setRenamingGroupName(name) }}
              onRenameChange={setRenamingGroupName}
              onRenameCommit={handleRenameGroup}
              onRenameCancel={() => setRenamingGroupId(null)}
              onDeleteGroup={() => deleteGroup(collection.id, group.id)}
              onOpenRequest={(r) => { openSavedRequest(r); onNavigate() }}
              onDeleteRequest={(rid) => deleteSavedRequest(collection.id, rid)}
              allGroups={groups}
              onMoveRequest={(rid, gid) => moveRequestToGroup(collection.id, rid, gid)}
              selectedIds={selectedIds}
              draggingIds={draggingIds}
              isDragOver={hoveredDropKey === `group:${group.id}`}
              onSelectRequest={onSelectRequest}
              onDragInit={onDragInit}
            />
          ))}

          {/* Root-level requests */}
          {collection.requests.map((req) => (
            <RequestRow
              key={req.id}
              request={req}
              currentGroupId={null}
              onNavigate={() => { openSavedRequest(req); onNavigate() }}
              onDelete={() => deleteSavedRequest(collection.id, req.id)}
              allGroups={groups}
              onMoveToGroup={(gid) => moveRequestToGroup(collection.id, req.id, gid)}
              isSelected={selectedIds.has(req.id)}
              isDragging={draggingIds.has(req.id)}
              onSelect={() => onSelectRequest(req.id)}
              onDragInit={(x, y) => onDragInit(req.id, x, y)}
            />
          ))}

          {/* Root drop zone — visible while dragging, when there are groups to move out of */}
          {isDragging && groups.length > 0 && (
            <div
              {...{ [ATTR_KEY]: rootDropKey, [ATTR_COL]: collection.id }}
              className={cn(
                'mt-1 h-7 rounded border border-dashed text-[10px] flex items-center justify-center transition-colors',
                hoveredDropKey === rootDropKey
                  ? 'border-primary/50 bg-primary/10 text-primary/70'
                  : 'border-border/40 text-muted-foreground/30'
              )}
            >
              Drop to ungroup
            </div>
          )}

          {/* Empty state */}
          {totalCount === 0 && !addingGroup && (
            <p className="text-muted-foreground/40 text-xs px-1 py-1 italic">Empty</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Group folder ──────────────────────────────────────────────────────────────

interface GroupFolderProps {
  group: CollectionGroup
  collectionId: string
  expanded: boolean
  onToggle: () => void
  renamingGroupId: string | null
  renamingGroupName: string
  onStartRename: (id: string, name: string) => void
  onRenameChange: (name: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onDeleteGroup: () => void
  onOpenRequest: (r: SavedRequest) => void
  onDeleteRequest: (id: string) => void
  allGroups: CollectionGroup[]
  onMoveRequest: (requestId: string, groupId: string | null) => void
  selectedIds: Set<string>
  draggingIds: Set<string>
  isDragOver: boolean
  onSelectRequest: (reqId: string) => void
  onDragInit: (reqId: string, x: number, y: number) => void
}

function GroupFolder(props: GroupFolderProps) {
  const {
    group, collectionId, expanded, onToggle,
    renamingGroupId, renamingGroupName, onStartRename, onRenameChange, onRenameCommit, onRenameCancel,
    onDeleteGroup, onOpenRequest, onDeleteRequest, allGroups, onMoveRequest,
    selectedIds, draggingIds, isDragOver, onSelectRequest, onDragInit,
  } = props

  const isRenaming = renamingGroupId === group.id
  const groupDropKey = `group:${group.id}`

  return (
    <div className="mb-0.5">
      {/* Group header — drop target via data attributes */}
      <div
        {...{ [ATTR_KEY]: groupDropKey, [ATTR_COL]: collectionId }}
        className={cn(
          'group flex items-center gap-1 px-1 py-1 rounded-md hover:bg-accent cursor-pointer transition-colors',
          isDragOver && 'bg-primary/10 ring-1 ring-primary/30'
        )}
        onClick={!isRenaming ? onToggle : undefined}
      >
        <ChevronRight
          className={cn('h-3 w-3 text-muted-foreground/50 shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
        />
        {expanded
          ? <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          : <Folder className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
        }

        {isRenaming ? (
          <Input
            autoFocus
            value={renamingGroupName}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onBlur={onRenameCommit}
            onClick={(e) => e.stopPropagation()}
            className="h-5 text-xs py-0 flex-1"
          />
        ) : (
          <span className="text-xs text-foreground/80 flex-1 truncate">{group.name}</span>
        )}

        <span className="text-[10px] text-muted-foreground/40">{group.requests.length}</span>

        <button
          onClick={(e) => { e.stopPropagation(); onStartRename(group.id, group.name) }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:text-foreground text-muted-foreground"
          aria-label="Rename group"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteGroup() }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:text-destructive text-muted-foreground"
          aria-label="Delete group"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Requests inside this group */}
      {expanded && (
        <div className="ml-3.5 border-l border-border pl-2">
          {group.requests.length === 0 && (
            <p className="text-muted-foreground/30 text-xs px-1 py-0.5 italic">Empty group</p>
          )}
          {group.requests.map((req) => (
            <RequestRow
              key={req.id}
              request={req}
              currentGroupId={group.id}
              onNavigate={() => onOpenRequest(req)}
              onDelete={() => onDeleteRequest(req.id)}
              allGroups={allGroups}
              onMoveToGroup={(gid) => onMoveRequest(req.id, gid)}
              isSelected={selectedIds.has(req.id)}
              isDragging={draggingIds.has(req.id)}
              onSelect={() => onSelectRequest(req.id)}
              onDragInit={(x, y) => onDragInit(req.id, x, y)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Request row ───────────────────────────────────────────────────────────────

interface RequestRowProps {
  request: SavedRequest
  currentGroupId: string | null
  onNavigate: () => void
  onDelete: () => void
  allGroups: CollectionGroup[]
  onMoveToGroup: (groupId: string | null) => void
  isSelected: boolean
  isDragging: boolean
  onSelect: () => void
  onDragInit: (x: number, y: number) => void
}

function RequestRow({
  request, currentGroupId, onNavigate, onDelete,
  allGroups, onMoveToGroup,
  isSelected, isDragging, onSelect, onDragInit,
}: RequestRowProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMoveMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMoveMenu])

  const moveOptions = allGroups.filter((g) => g.id !== currentGroupId)
  const canMoveToRoot = currentGroupId !== null

  return (
    <div
      className={cn(
        'group relative flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-pointer select-none transition-colors',
        isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-accent',
        isDragging && 'opacity-40'
      )}
      onClick={(e) => {
        if (e.shiftKey) { e.stopPropagation(); onSelect() }
        else onNavigate()
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || e.shiftKey) return
        e.preventDefault()   // prevent text selection during drag
        onDragInit(e.clientX, e.clientY)
      }}
    >
      <span
        className="text-[10px] font-bold w-10 text-right shrink-0"
        style={{ color: METHOD_COLORS[request.method] }}
      >
        {request.method}
      </span>
      <span className="text-xs text-foreground/80 truncate flex-1">{request.name}</span>

      {/* Move-to-group button */}
      {(moveOptions.length > 0 || canMoveToRoot) && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowMoveMenu(!showMoveMenu) }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:text-foreground text-muted-foreground"
          aria-label="Move to group"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      )}

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover:text-destructive text-muted-foreground"
        aria-label="Delete request"
      >
        <Trash2 className="h-3 w-3" />
      </button>

      {/* Move menu */}
      {showMoveMenu && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 min-w-[140px] bg-popover border border-border rounded-md shadow-lg py-1 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
            Move to
          </div>
          {canMoveToRoot && (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex items-center gap-1.5"
              onClick={() => { onMoveToGroup(null); setShowMoveMenu(false) }}
            >
              <FolderOpen className="h-3 w-3 text-muted-foreground/60" />
              <span>Root (ungrouped)</span>
            </button>
          )}
          {moveOptions.map((g) => (
            <button
              key={g.id}
              className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex items-center gap-1.5"
              onClick={() => { onMoveToGroup(g.id); setShowMoveMenu(false) }}
            >
              <Folder className="h-3 w-3 text-muted-foreground/60" />
              <span className="truncate">{g.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
