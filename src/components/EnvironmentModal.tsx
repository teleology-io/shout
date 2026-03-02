import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { Collection, EnvVariable } from '../types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Checkbox } from './ui/checkbox'
import { X, Plus, Trash2, Check, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  collection: Collection
  onClose: () => void
}

export function EnvironmentModal({ collection, onClose }: Props) {
  const { addEnvironment, deleteEnvironment, renameEnvironment, setActiveEnvironment, updateEnvironmentVariables } = useStore()

  const envs = collection.environments ?? []

  // Which env is currently selected for editing in the right panel
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(
    collection.activeEnvironmentId ?? envs[0]?.id ?? null
  )
  const [addingEnv, setAddingEnv] = useState(false)
  const [newEnvName, setNewEnvName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState('')

  const selectedEnv = envs.find((e) => e.id === selectedEnvId) ?? null

  const handleAddEnv = () => {
    if (!newEnvName.trim()) return
    const env = addEnvironment(collection.id, newEnvName.trim())
    setSelectedEnvId(env.id)
    setActiveEnvironment(collection.id, env.id)
    setNewEnvName('')
    setAddingEnv(false)
  }

  const handleDeleteEnv = (envId: string) => {
    deleteEnvironment(collection.id, envId)
    if (selectedEnvId === envId) {
      const remaining = envs.filter((e) => e.id !== envId)
      setSelectedEnvId(remaining[0]?.id ?? null)
    }
  }

  const handleSelectEnv = (envId: string | null) => {
    setSelectedEnvId(envId)
    setActiveEnvironment(collection.id, envId)
  }

  const handleRenameCommit = () => {
    if (!renamingId || !renamingName.trim()) { setRenamingId(null); return }
    renameEnvironment(collection.id, renamingId, renamingName.trim())
    setRenamingId(null)
  }

  const handleVariablesChange = (variables: EnvVariable[]) => {
    if (!selectedEnvId) return
    updateEnvironmentVariables(collection.id, selectedEnvId, variables)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col"
        style={{ height: '70vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Environments</span>
            <span className="text-muted-foreground/60 text-xs">— {collection.name}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body: two-column */}
        <div className="flex flex-1 min-h-0">
          {/* Left: environment list */}
          <div className="w-48 shrink-0 border-r border-border flex flex-col">
            <div className="flex-1 overflow-y-auto py-1">
              {/* "No environment" option */}
              <button
                className={cn(
                  'w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-accent transition-colors',
                  !collection.activeEnvironmentId && 'bg-accent/50'
                )}
                onClick={() => handleSelectEnv(null)}
              >
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  !collection.activeEnvironmentId ? 'bg-primary' : 'border border-muted-foreground/30'
                )} />
                <span className="italic text-muted-foreground/70">No Environment</span>
              </button>

              {envs.map((env) => (
                <div
                  key={env.id}
                  className={cn(
                    'group flex items-center hover:bg-accent transition-colors',
                    selectedEnvId === env.id && 'bg-accent/50'
                  )}
                >
                  {renamingId === env.id ? (
                    <Input
                      autoFocus
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCommit()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={handleRenameCommit}
                      className="h-7 text-xs mx-1 my-0.5 flex-1"
                    />
                  ) : (
                    <button
                      className="flex-1 text-left px-3 py-2 text-xs flex items-center gap-2 min-w-0"
                      onClick={() => handleSelectEnv(env.id)}
                      onDoubleClick={() => { setRenamingId(env.id); setRenamingName(env.name) }}
                    >
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        collection.activeEnvironmentId === env.id ? 'bg-primary' : 'border border-muted-foreground/30'
                      )} />
                      <span className="truncate">{env.name}</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteEnv(env.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded hover:text-destructive text-muted-foreground transition-opacity shrink-0"
                    aria-label="Delete environment"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add environment */}
            <div className="border-t border-border p-2 shrink-0">
              {addingEnv ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddEnv()
                      if (e.key === 'Escape') { setAddingEnv(false); setNewEnvName('') }
                    }}
                    placeholder="Name…"
                    className="h-7 text-xs flex-1"
                  />
                  <button
                    onClick={handleAddEnv}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-xs h-7 text-muted-foreground justify-start"
                  onClick={() => setAddingEnv(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Environment
                </Button>
              )}
            </div>
          </div>

          {/* Right: variables editor */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedEnv ? (
              <VariablesEditor
                key={selectedEnv.id}
                variables={selectedEnv.variables}
                onChange={handleVariablesChange}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground/40 text-sm">
                <FlaskConical className="h-8 w-8" />
                {envs.length === 0
                  ? 'Create an environment to get started'
                  : 'Select an environment to edit its variables'}
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="border-t border-border px-4 py-2 shrink-0 flex items-center gap-4">
          <p className="text-[10px] text-muted-foreground/50">
            Use <code className="font-mono bg-muted px-1 rounded">{'{{variableName}}'}</code> in URLs, headers, params, and body to substitute values from the active environment.
          </p>
          {collection.activeEnvironmentId && (
            <span className="ml-auto text-[10px] text-primary/70 shrink-0">
              Active: {envs.find((e) => e.id === collection.activeEnvironmentId)?.name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Variables editor ──────────────────────────────────────────────────────────

function VariablesEditor({
  variables,
  onChange,
}: {
  variables: EnvVariable[]
  onChange: (vars: EnvVariable[]) => void
}) {
  const update = (id: string, changes: Partial<EnvVariable>) =>
    onChange(variables.map((v) => (v.id === id ? { ...v, ...changes } : v)))

  const add = () =>
    onChange([...variables, { id: crypto.randomUUID(), key: '', value: '', enabled: true }])

  const remove = (id: string) =>
    onChange(variables.filter((v) => v.id !== id))

  return (
    <div className="flex flex-col h-full">
      {/* Column headers */}
      <div className="flex items-center border-b border-border px-3 py-1.5 shrink-0">
        <div className="w-7 shrink-0" />
        <div className="flex-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Variable</div>
        <div className="flex-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Value</div>
        <div className="w-7 shrink-0" />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {variables.length === 0 && (
          <div className="text-center py-10 text-muted-foreground/40 text-sm">
            No variables yet — add one below
          </div>
        )}
        {variables.map((v) => (
          <div
            key={v.id}
            className="group flex items-center border-b border-border/40 hover:bg-accent/20"
          >
            <div className="w-7 shrink-0 flex items-center justify-center">
              <Checkbox
                checked={v.enabled}
                onCheckedChange={(val) => update(v.id, { enabled: !!val })}
              />
            </div>
            <Input
              value={v.key}
              onChange={(e) => update(v.id, { key: e.target.value })}
              placeholder="VARIABLE_NAME"
              className="flex-1 h-8 border-0 bg-transparent shadow-none focus-visible:bg-input focus-visible:ring-0 font-mono text-xs px-2 rounded-none"
            />
            <Input
              value={v.value}
              onChange={(e) => update(v.id, { value: e.target.value })}
              placeholder="value"
              className="flex-1 h-8 border-0 bg-transparent shadow-none focus-visible:bg-input focus-visible:ring-0 font-mono text-xs px-2 rounded-none"
            />
            <div className="w-7 shrink-0 flex items-center justify-center">
              <button
                onClick={() => remove(v.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive text-muted-foreground transition-opacity"
                aria-label="Remove variable"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add row */}
      <div className="border-t border-border p-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground text-xs h-7"
          onClick={add}
        >
          <Plus className="h-3.5 w-3.5" /> Add Variable
        </Button>
      </div>
    </div>
  )
}
