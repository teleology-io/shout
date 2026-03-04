import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { HttpMethod, RequestTab, KeyValue } from '../types'
import { METHOD_COLORS, newKeyValue } from '../types'
import { useCollectionEnvVars, hasVars } from '../utils/envVars'
import { VarText } from './VarText'
import { KeyValueEditor } from './KeyValueEditor'
import { JsonEditor } from './JsonEditor'
import { CodeSnippetDialog } from './CodeSnippetDialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { ScrollArea } from './ui/scroll-area'
import { Loader2, Save, SendHorizonal, Plus, X, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function insertTab(e: React.KeyboardEvent<HTMLTextAreaElement>, onChange: (v: string) => void) {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const ta = e.currentTarget
  const start = ta.selectionStart
  const end = ta.selectionEnd
  onChange(ta.value.substring(0, start) + '  ' + ta.value.substring(end))
  requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const GQL_COLOR = '#e040fb'

interface Props {
  tab: RequestTab
}

export function RequestPanel({ tab }: Props) {
  const { updateTab, sendRequest, saveTabToCollection, saveTabToRoot, addCollection, collections } = useStore()
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState(tab.name)
  const [saveColId, setSaveColId] = useState(collections[0]?.id ?? '__root__')
  const [newColName, setNewColName] = useState('')
  const [showSnippet, setShowSnippet] = useState(false)
  const envVars = useCollectionEnvVars(tab.collectionId)

  const update = (changes: Partial<RequestTab>) => updateTab(tab.id, changes)

  const handleSend = () => { if (tab.url.trim()) sendRequest(tab.id) }

  const handleSave = () => {
    const name = saveName || tab.url || 'New Request'
    if (saveColId === '__root__') {
      saveTabToRoot(tab.id, name)
    } else if (saveColId === '__new__') {
      if (!newColName.trim()) return
      const col = addCollection(newColName.trim())
      saveTabToCollection(tab.id, col.id, name)
    } else {
      if (!saveColId) return
      saveTabToCollection(tab.id, saveColId, name)
    }
    setShowSave(false)
    setNewColName('')
  }

  const enabledParams = tab.params.filter((p) => p.enabled && p.key).length
  const enabledHeaders = tab.headers.filter((h) => h.enabled && h.key).length

  return (
    <div className="flex flex-col h-full bg-background">
      {/* URL bar — stacks vertically on small screens */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        {/* Method picker — "GQL" is a pseudo-method: sends as POST with graphql body */}
        {(() => {
          const isGql = tab.body.type === 'graphql'
          const displayMethod = isGql ? 'GQL' : tab.method
          const methodColor = isGql ? GQL_COLOR : METHOD_COLORS[tab.method]
          const handleMethodChange = (v: string) => {
            if (v === 'GQL') {
              update({ method: 'POST', body: { type: 'graphql', content: tab.body.content, variables: tab.body.variables } })
            } else {
              update({
                method: v as HttpMethod,
                ...(isGql ? { body: { type: 'none' as const, content: '' } } : {}),
              })
            }
          }
          return (
            <Select value={displayMethod} onValueChange={handleMethodChange}>
              <SelectTrigger className="w-[105px] shrink-0 font-bold text-xs" style={{ color: methodColor }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="font-bold text-xs" style={{ color: METHOD_COLORS[m] }}>
                    {m}
                  </SelectItem>
                ))}
                <SelectItem value="GQL" className="font-bold text-xs" style={{ color: GQL_COLOR }}>
                  GQL
                </SelectItem>
              </SelectContent>
            </Select>
          )
        })()}

        {/* URL */}
        <Input
          value={tab.url}
          onChange={(e) => update({ url: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="https://api.example.com/endpoint"
          className="flex-1 min-w-0 font-mono text-sm h-8"
        />

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          <Button
            onClick={handleSend}
            disabled={tab.isLoading || !tab.url.trim()}
            size="sm"
            className="gap-1.5 h-8"
          >
            {tab.isLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending</>
              : <><SendHorizonal className="h-3.5 w-3.5" /> Send</>
            }
          </Button>

          {/* Save popover */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => { setShowSave(!showSave); setSaveName(tab.name) }}
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save</span>
            </Button>

            {showSave && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-border bg-card shadow-xl p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Save request</p>
                <Input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false) }}
                  placeholder="Request name"
                  className="h-7 text-xs"
                />
                <Select
                  value={saveColId}
                  onValueChange={(v) => { setSaveColId(v); if (v !== '__new__') setNewColName('') }}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select collection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__" className="text-xs text-muted-foreground">No collection</SelectItem>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                    ))}
                    <SelectItem value="__new__" className="text-xs text-primary">+ New collection</SelectItem>
                  </SelectContent>
                </Select>
                {saveColId === '__new__' && (
                  <Input
                    autoFocus
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSave(false) }}
                    placeholder="Collection name"
                    className="h-7 text-xs"
                  />
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowSave(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={saveColId === '__new__' && !newColName.trim()}
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setShowSnippet(true)}
            disabled={!tab.url.trim()}
            title="Code snippet"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Code</span>
          </Button>
        </div>
      </div>

      <CodeSnippetDialog tab={tab} open={showSnippet} onClose={() => setShowSnippet(false)} />

      {/* Variable preview strip */}
      {hasVars(tab.url) && (
        <div className="px-3 py-1 border-b border-border bg-muted/30 shrink-0 flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <span className="text-[10px] text-muted-foreground/50 shrink-0">Preview:</span>
          <VarText text={tab.url} vars={envVars} />
        </div>
      )}

      {/* Request config tabs */}
      <Tabs defaultValue="params" className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 h-9 bg-card/50">
          <TabsTrigger value="params" className="text-xs">
            Params{enabledParams > 0 && <span className="ml-1 text-primary">({enabledParams})</span>}
          </TabsTrigger>
          <TabsTrigger value="headers" className="text-xs">
            Headers{enabledHeaders > 0 && <span className="ml-1 text-primary">({enabledHeaders})</span>}
          </TabsTrigger>
          <TabsTrigger value="body" className="text-xs">
            {tab.body.type === 'graphql' ? 'GraphQL' : 'Body'}
          </TabsTrigger>
          <TabsTrigger value="auth" className="text-xs">Auth</TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="flex-1 min-h-0 mt-0">
          <KeyValueEditor tabId={tab.id} field="params" />
        </TabsContent>
        <TabsContent value="headers" className="flex-1 min-h-0 mt-0">
          <KeyValueEditor tabId={tab.id} field="headers" />
        </TabsContent>
        <TabsContent value="body" className="">
          <BodyEditor tab={tab} update={update} />
        </TabsContent>
        <TabsContent value="auth" className="">
          <AuthEditor tab={tab} update={update} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Body editor ───────────────────────────────────────────────────────────────

const BODY_TYPE_LABELS: Record<string, string> = {
  none: 'None',
  json: 'JSON',
  text: 'Text',
  form: 'Form',
}

function BodyEditor({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  const { body } = tab

  // GraphQL mode is driven by the method selector — skip the picker and render the editor directly
  if (body.type === 'graphql') {
    return <GraphQLEditor body={body} onChange={(b) => update({ body: b })} tabId={tab.id} />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Type picker — graphql removed; it's set via the GQL pseudo-method */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <RadioGroup
          value={body.type}
          onValueChange={(v) => update({ body: { ...body, type: v as typeof body.type } })}
          className="flex flex-wrap gap-x-4 gap-y-1"
        >
          {(['none', 'json', 'text', 'form'] as const).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <RadioGroupItem value={t} id={`body-${tab.id}-${t}`} />
              <Label htmlFor={`body-${tab.id}-${t}`} className={cn('cursor-pointer', body.type === t && 'text-foreground')}>
                {BODY_TYPE_LABELS[t]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {body.type === 'none' && (
          <div className="h-full flex items-center justify-center text-muted-foreground/50 text-sm">
            No body
          </div>
        )}
        {body.type === 'json' && (
          <JsonEditor
            value={body.content}
            onChange={(content) => update({ body: { ...body, content } })}
          />
        )}
        {body.type === 'text' && (
          <Textarea
            value={body.content}
            onChange={(e) => update({ body: { ...body, content: e.target.value } })}
            onKeyDown={(e) => insertTab(e, (v) => update({ body: { ...body, content: v } }))}
            placeholder="Plain text body…"
            spellCheck={false}
            className="w-full h-full resize-none rounded-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        )}
        {body.type === 'form' && (
          <FormFieldsEditor
            fields={body.fields ?? []}
            onChange={(fields) => update({ body: { ...body, fields } })}
          />
        )}
      </div>
    </div>
  )
}

function GraphQLEditor({
  body,
  onChange,
  tabId,
}: {
  body: RequestTab['body']
  onChange: (b: RequestTab['body']) => void
  tabId: string
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Query */}
      <div className="flex flex-col" style={{ flex: '0 0 60%', minHeight: 0 }}>
        <div className="px-3 py-1 border-b border-border shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Query</span>
        </div>
        <Textarea
          value={body.content}
          onChange={(e) => onChange({ ...body, content: e.target.value })}
          onKeyDown={(e) => insertTab(e, (v) => onChange({ ...body, content: v }))}
          placeholder={'query {\n  user(id: "1") {\n    id\n    name\n  }\n}'}
          spellCheck={false}
          className="flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          style={{ height: '100%' }}
        />
      </div>

      {/* Variables */}
      <div className="flex flex-col border-t border-border" style={{ flex: '0 0 40%', minHeight: 0 }}>
        <div className="px-3 py-1 border-b border-border shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variables</span>
          <span className="text-[10px] text-muted-foreground/50">JSON</span>
        </div>
        <Textarea
          key={`gql-vars-${tabId}`}
          value={body.variables ?? ''}
          onChange={(e) => onChange({ ...body, variables: e.target.value })}
          onKeyDown={(e) => insertTab(e, (v) => onChange({ ...body, variables: v }))}
          placeholder={'{\n  "id": "1"\n}'}
          spellCheck={false}
          className="flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  )
}

function FormFieldsEditor({ fields, onChange }: { fields: KeyValue[]; onChange: (f: KeyValue[]) => void }) {
  const updateField = (id: string, changes: Partial<KeyValue>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...changes } : f)))

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="w-8 p-2" />
              <th className="p-2 text-left font-medium text-muted-foreground w-[45%]">Key</th>
              <th className="p-2 text-left font-medium text-muted-foreground">Value</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-b border-border/50 group hover:bg-accent/30">
                <td className="p-1.5 text-center">
                  <Checkbox checked={f.enabled} onCheckedChange={(v) => updateField(f.id, { enabled: !!v })} />
                </td>
                <td className="p-1">
                  <Input value={f.key} placeholder="Key" onChange={(e) => updateField(f.id, { key: e.target.value })}
                    className="h-7 border-0 bg-transparent shadow-none focus-visible:bg-input focus-visible:ring-0 font-mono text-xs px-1" />
                </td>
                <td className="p-1">
                  <Input value={f.value} placeholder="Value" onChange={(e) => updateField(f.id, { value: e.target.value })}
                    className="h-7 border-0 bg-transparent shadow-none focus-visible:bg-input focus-visible:ring-0 font-mono text-xs px-1" />
                </td>
                <td className="p-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                    onClick={() => onChange(fields.filter((x) => x.id !== f.id))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      <div className="border-t border-border p-1.5">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-xs h-7"
          onClick={() => onChange([...fields, newKeyValue()])}>
          <Plus className="h-3.5 w-3.5" /> Add Field
        </Button>
      </div>
    </div>
  )
}

// ── Auth editor ───────────────────────────────────────────────────────────────

function AuthEditor({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  const { auth } = tab
  const setAuth = (changes: Partial<typeof auth>) => update({ auth: { ...auth, ...changes } })

  return (
    <div className="p-4 space-y-4 max-w-md">
      <div>
        <Label className="mb-1.5 block">Auth Type</Label>
        <Select value={auth.type} onValueChange={(v) => setAuth({ type: v as typeof auth.type })}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Auth</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="apikey">API Key</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {auth.type === 'bearer' && (
        <div>
          <Label className="mb-1.5 block">Token</Label>
          <Input value={auth.token ?? ''} onChange={(e) => setAuth({ token: e.target.value })}
            placeholder="Bearer token" className="font-mono" />
        </div>
      )}

      {auth.type === 'basic' && (
        <>
          <div>
            <Label className="mb-1.5 block">Username</Label>
            <Input value={auth.username ?? ''} onChange={(e) => setAuth({ username: e.target.value })} placeholder="Username" />
          </div>
          <div>
            <Label className="mb-1.5 block">Password</Label>
            <Input type="password" value={auth.password ?? ''} onChange={(e) => setAuth({ password: e.target.value })} placeholder="Password" />
          </div>
        </>
      )}

      {auth.type === 'apikey' && (
        <>
          <div>
            <Label className="mb-1.5 block">Key</Label>
            <Input value={auth.key ?? ''} onChange={(e) => setAuth({ key: e.target.value })} placeholder="X-API-Key" />
          </div>
          <div>
            <Label className="mb-1.5 block">Value</Label>
            <Input value={auth.value ?? ''} onChange={(e) => setAuth({ value: e.target.value })}
              placeholder="your-api-key" className="font-mono" />
          </div>
          <div>
            <Label className="mb-1.5 block">Add to</Label>
            <Select value={auth.addTo ?? 'header'} onValueChange={(v) => setAuth({ addTo: v as 'header' | 'query' })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Param</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {auth.type === 'none' && (
        <p className="text-muted-foreground/60 text-sm">This request does not use authorization.</p>
      )}
    </div>
  )
}
