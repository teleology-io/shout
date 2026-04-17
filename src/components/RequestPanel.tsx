import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import type { HttpMethod, RequestTab, KeyValue, ResponseExtraction, JwtConfig, AwsSigV4Config, OAuth2Config } from '../types'
import { METHOD_COLORS, newKeyValue, WS_COLOR, SSE_COLOR } from '../types'
import { useResolvedEnvVars, hasVars } from '../utils/envVars'
import { parseCurl, looksLikeCurl, parsedCurlToTab } from '../utils/curlParser'
import { testExtraction } from '../utils/extraction'
import { signJwt } from '../utils/jwt'
import { VarText } from './VarText'
import { KeyValueEditor } from './KeyValueEditor'
import { JsonEditor } from './JsonEditor'
import { CodeSnippetDialog } from './CodeSnippetDialog'
import { WsPanel } from './WsPanel'
import { SsePanel } from './SsePanel'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { ScrollArea } from './ui/scroll-area'
import { Loader2, Save, SendHorizonal, Plus, X, Code2, Pencil, RefreshCw, Copy, Zap } from 'lucide-react'
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
  const { updateTab, sendRequest, startStreamRequest, saveTabToCollection, saveTabToRoot, addCollection, collections } = useStore()
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState(tab.name)
  const [saveColId, setSaveColId] = useState(collections[0]?.id ?? '__root__')
  const [newColName, setNewColName] = useState('')
  const [showSnippet, setShowSnippet] = useState(false)
  const envVars = useResolvedEnvVars(tab.collectionId, tab.savedRequestId)

  useEffect(() => {
    const handler = () => { setShowSave(true); setSaveName(tab.name) }
    window.addEventListener('shout:open-save', handler)
    return () => window.removeEventListener('shout:open-save', handler)
  }, [tab.name])

  const update = (changes: Partial<RequestTab>) => updateTab(tab.id, changes)

  const kind = tab.requestKind ?? 'http'
  const isStream = tab.streamMode ?? false

  const handleSend = () => {
    if (!tab.url.trim()) return
    if (isStream) {
      startStreamRequest(tab.id)
    } else {
      sendRequest(tab.id)
    }
  }

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

  // If WS or SSE mode, render dedicated panels
  if (kind === 'ws') {
    return <WsWithHeader tab={tab} update={update} />
  }
  if (kind === 'sse') {
    return <SseWithHeader tab={tab} update={update} />
  }

  const enabledParams = tab.params.filter((p) => p.enabled && p.key).length
  const enabledHeaders = tab.headers.filter((h) => h.enabled && h.key).length
  const hasExtractions = (tab.extractions ?? []).some((e) => e.enabled)

  return (
    <div className="flex flex-col h-full bg-background">
      {/* URL bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        {/* Method / kind picker */}
        {(() => {
          const isGql = tab.body.type === 'graphql'
          const displayMethod = isGql ? 'GQL' : tab.method
          const methodColor = isGql ? GQL_COLOR : METHOD_COLORS[tab.method]

          const handleMethodChange = (v: string) => {
            if (v === 'GQL') {
              update({ method: 'POST', body: { type: 'graphql', content: tab.body.content, variables: tab.body.variables } })
            } else if (v === 'WS') {
              update({ requestKind: 'ws', method: 'GET' })
            } else if (v === 'SSE') {
              update({ requestKind: 'sse', method: 'GET' })
            } else {
              update({
                requestKind: 'http',
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
                <SelectItem value="GQL" className="font-bold text-xs" style={{ color: GQL_COLOR }}>GQL</SelectItem>
                <SelectItem value="WS" className="font-bold text-xs" style={{ color: WS_COLOR }}>WS</SelectItem>
                <SelectItem value="SSE" className="font-bold text-xs" style={{ color: SSE_COLOR }}>SSE</SelectItem>
              </SelectContent>
            </Select>
          )
        })()}

        {/* URL */}
        <Input
          value={tab.url}
          onChange={(e) => update({ url: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (looksLikeCurl(text)) {
              e.preventDefault()
              const parsed = parseCurl(text)
              if (parsed) update(parsedCurlToTab(parsed))
            }
          }}
          placeholder="https://api.example.com/endpoint  (or paste a cURL command)"
          className="flex-1 min-w-0 font-mono text-sm h-8"
        />

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0 items-center">
          {/* Stream toggle */}
          <button
            onClick={() => update({ streamMode: !isStream })}
            title={isStream ? 'Streaming mode (click to disable)' : 'Enable streaming mode'}
            className={cn(
              'h-8 w-8 flex items-center justify-center rounded border border-border hover:bg-accent transition-colors',
              isStream ? 'text-primary border-primary/40 bg-primary/5' : 'text-muted-foreground'
            )}
          >
            <Zap className="h-3.5 w-3.5" />
          </button>

          <Button
            onClick={handleSend}
            disabled={tab.isLoading || !tab.url.trim()}
            size="sm"
            className="gap-1.5 h-8"
          >
            {tab.isLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="hidden sm:inline">Sending</span></>
              : <><SendHorizonal className="h-3.5 w-3.5" /><span className="hidden sm:inline">Send</span></>
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
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select collection" /></SelectTrigger>
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
          <TabsTrigger value="extract" className="text-xs">
            Extract{hasExtractions && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
          </TabsTrigger>
          <TabsTrigger value="docs" className="text-xs gap-1">
            Docs{tab.description && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
          </TabsTrigger>
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
        <TabsContent value="extract" className="flex-1 min-h-0 mt-0">
          <ExtractionsEditor tab={tab} update={update} />
        </TabsContent>
        <TabsContent value="docs" className="flex-1 min-h-0 mt-0">
          <DocsEditor tab={tab} update={update} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── WS/SSE wrappers ────────────────────────────────────────────────────────────

function WsWithHeader({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Select
          value="WS"
          onValueChange={(v) => {
            if (v !== 'WS') update({ requestKind: v === 'SSE' ? 'sse' : 'http', method: v === 'SSE' ? 'GET' : 'GET' })
          }}
        >
          <SelectTrigger className="w-[80px] h-7 font-bold text-xs" style={{ color: WS_COLOR }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WS" className="font-bold text-xs" style={{ color: WS_COLOR }}>WS</SelectItem>
            <SelectItem value="SSE" className="font-bold text-xs" style={{ color: SSE_COLOR }}>SSE</SelectItem>
            <SelectItem value="GET" className="font-bold text-xs" style={{ color: METHOD_COLORS['GET'] }}>HTTP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <WsPanel tab={tab} />
    </div>
  )
}

function SseWithHeader({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Select
          value="SSE"
          onValueChange={(v) => {
            if (v !== 'SSE') update({ requestKind: v === 'WS' ? 'ws' : 'http', method: 'GET' })
          }}
        >
          <SelectTrigger className="w-[80px] h-7 font-bold text-xs" style={{ color: SSE_COLOR }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SSE" className="font-bold text-xs" style={{ color: SSE_COLOR }}>SSE</SelectItem>
            <SelectItem value="WS" className="font-bold text-xs" style={{ color: WS_COLOR }}>WS</SelectItem>
            <SelectItem value="GET" className="font-bold text-xs" style={{ color: METHOD_COLORS['GET'] }}>HTTP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SsePanel tab={tab} />
    </div>
  )
}

// ── Body editor ───────────────────────────────────────────────────────────────

const BODY_TYPE_LABELS: Record<string, string> = {
  none: 'None',
  json: 'JSON',
  text: 'Text',
  form: 'Form URL-encoded',
  multipart: 'Multipart',
}

function BodyEditor({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  const { body } = tab

  if (body.type === 'graphql') {
    return <GraphQLEditor body={body} onChange={(b) => update({ body: b })} tabId={tab.id} />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <RadioGroup
          value={body.type}
          onValueChange={(v) => update({ body: { ...body, type: v as typeof body.type } })}
          className="flex flex-wrap gap-x-4 gap-y-1"
        >
          {(['none', 'json', 'text', 'form', 'multipart'] as const).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <RadioGroupItem value={t} id={`body-${tab.id}-${t}`} />
              <Label htmlFor={`body-${tab.id}-${t}`} className={cn('cursor-pointer', body.type === t && 'text-foreground')}>
                {BODY_TYPE_LABELS[t]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {body.type === 'none' && (
          <div className="h-full flex items-center justify-center text-muted-foreground/50 text-sm">No body</div>
        )}
        {body.type === 'json' && (
          <JsonEditor value={body.content} onChange={(content) => update({ body: { ...body, content } })} />
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
          <FormFieldsEditor fields={body.fields ?? []} onChange={(fields) => update({ body: { ...body, fields } })} />
        )}
        {body.type === 'multipart' && (
          <FormFieldsEditor
            fields={body.fields ?? []}
            onChange={(fields) => update({ body: { ...body, fields } })}
            emptyText="No fields yet — multipart/form-data"
          />
        )}
      </div>
    </div>
  )
}

function GraphQLEditor({ body, onChange, tabId }: { body: RequestTab['body']; onChange: (b: RequestTab['body']) => void; tabId: string }) {
  return (
    <div className="flex flex-col h-full">
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

function FormFieldsEditor({ fields, onChange, emptyText }: { fields: KeyValue[]; onChange: (f: KeyValue[]) => void; emptyText?: string }) {
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
      {fields.length === 0 && emptyText && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground/50 italic">{emptyText}</div>
      )}
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
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 max-w-lg">
        <div>
          <Label className="mb-1.5 block">Auth Type</Label>
          <Select value={auth.type} onValueChange={(v) => setAuth({ type: v as typeof auth.type })}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Inherit (from folder / collection)</SelectItem>
              <SelectItem value="none">No Auth</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="basic">Basic Auth</SelectItem>
              <SelectItem value="apikey">API Key</SelectItem>
              <SelectItem value="jwt">JWT (HMAC)</SelectItem>
              <SelectItem value="awssigv4">AWS Signature v4</SelectItem>
              <SelectItem value="oauth2">OAuth 2.0</SelectItem>
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

        {auth.type === 'jwt' && (
          <JwtEditor auth={auth} setAuth={setAuth} />
        )}

        {auth.type === 'awssigv4' && (
          <AwsSigV4Editor auth={auth} setAuth={setAuth} />
        )}

        {auth.type === 'oauth2' && (
          <OAuth2Editor tab={tab} auth={auth} setAuth={setAuth} />
        )}

        {auth.type === 'none' && (
          <p className="text-muted-foreground/60 text-sm">This request does not use authorization.</p>
        )}
        {auth.type === 'inherit' && (
          <p className="text-muted-foreground/60 text-sm">Auth will be inherited from the parent folder or collection.</p>
        )}
      </div>
    </ScrollArea>
  )
}

// ── JWT editor ────────────────────────────────────────────────────────────────

const DEFAULT_JWT: JwtConfig = {
  algorithm: 'HS256',
  secret: '',
  payload: '{\n  "sub": "1234567890",\n  "name": "John Doe"\n}',
  addExpiry: true,
  expirySeconds: 3600,
}

function JwtEditor({ auth, setAuth }: {
  auth: { jwt?: JwtConfig };
  setAuth: (c: Partial<typeof auth>) => void
}) {
  const jwt = auth.jwt ?? DEFAULT_JWT
  const setJwt = (updates: Partial<JwtConfig>) =>
    setAuth({ jwt: { ...jwt, ...updates } })

  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    try {
      const token = await signJwt(jwt)
      setGeneratedToken(token)
    } catch (e) {
      setGeneratedToken('Error: ' + String(e))
    }
  }

  const copy = () => {
    if (!generatedToken) return
    navigator.clipboard.writeText(generatedToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <>
      <div>
        <Label className="mb-1.5 block">Algorithm</Label>
        <Select value={jwt.algorithm} onValueChange={(v) => setJwt({ algorithm: v as JwtConfig['algorithm'] })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="HS256">HS256</SelectItem>
            <SelectItem value="HS384">HS384</SelectItem>
            <SelectItem value="HS512">HS512</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Secret</Label>
        <Input
          type="password"
          value={jwt.secret}
          onChange={(e) => setJwt({ secret: e.target.value })}
          placeholder="HMAC secret"
          className="font-mono"
        />
      </div>
      <div>
        <Label className="mb-1.5 block">Payload (JSON)</Label>
        <Textarea
          value={jwt.payload}
          onChange={(e) => setJwt({ payload: e.target.value })}
          className="font-mono text-xs min-h-[80px] resize-none"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={jwt.addExpiry}
          onCheckedChange={(v) => setJwt({ addExpiry: !!v })}
          id="jwt-exp"
        />
        <Label htmlFor="jwt-exp" className="cursor-pointer text-sm">Add expiry</Label>
        {jwt.addExpiry && (
          <div className="flex items-center gap-1.5 ml-2">
            <Input
              type="number"
              value={jwt.expirySeconds}
              onChange={(e) => setJwt({ expirySeconds: Number(e.target.value) })}
              className="h-7 w-20 text-xs"
              min={1}
            />
            <span className="text-xs text-muted-foreground">seconds</span>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Label>Generated Token</Label>
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={generate}>
            <RefreshCw className="h-3 w-3" /> Preview
          </Button>
          {generatedToken && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={copy}>
              <Copy className="h-3 w-3" /> {copied ? '✓' : 'Copy'}
            </Button>
          )}
        </div>
        {generatedToken && (
          <div className="font-mono text-[10px] bg-muted/30 rounded p-2 break-all text-muted-foreground max-h-20 overflow-y-auto">
            {generatedToken}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Token generated on each request automatically.
        </p>
      </div>
    </>
  )
}

// ── AWS SigV4 editor ──────────────────────────────────────────────────────────

const DEFAULT_SIGV4: AwsSigV4Config = {
  accessKeyId: '',
  secretAccessKey: '',
  region: 'us-east-1',
  service: 'execute-api',
}

function AwsSigV4Editor({ auth, setAuth }: {
  auth: { awsSigV4?: AwsSigV4Config };
  setAuth: (c: Partial<typeof auth>) => void
}) {
  const cfg = auth.awsSigV4 ?? DEFAULT_SIGV4
  const set = (updates: Partial<AwsSigV4Config>) =>
    setAuth({ awsSigV4: { ...cfg, ...updates } })

  return (
    <>
      <div>
        <Label className="mb-1.5 block">Access Key ID</Label>
        <Input value={cfg.accessKeyId} onChange={(e) => set({ accessKeyId: e.target.value })}
          placeholder="AKIAIOSFODNN7EXAMPLE" className="font-mono" />
      </div>
      <div>
        <Label className="mb-1.5 block">Secret Access Key</Label>
        <Input type="password" value={cfg.secretAccessKey} onChange={(e) => set({ secretAccessKey: e.target.value })}
          placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" className="font-mono" />
      </div>
      <div>
        <Label className="mb-1.5 block">Session Token <span className="text-muted-foreground/60">(optional)</span></Label>
        <Input value={cfg.sessionToken ?? ''} onChange={(e) => set({ sessionToken: e.target.value || undefined })}
          placeholder="For STS / assumed roles" className="font-mono text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block">Region</Label>
          <Input value={cfg.region} onChange={(e) => set({ region: e.target.value })}
            placeholder="us-east-1" className="font-mono" />
        </div>
        <div>
          <Label className="mb-1.5 block">Service</Label>
          <Input value={cfg.service} onChange={(e) => set({ service: e.target.value })}
            placeholder="execute-api" className="font-mono" />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        Signature computed in the desktop app via HMAC-SHA256.
      </p>
    </>
  )
}

// ── OAuth2 editor ─────────────────────────────────────────────────────────────

const DEFAULT_OAUTH2: OAuth2Config = {
  grantType: 'client_credentials',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
}

function OAuth2Editor({ tab, auth, setAuth }: {
  tab: RequestTab;
  auth: { oauth2?: OAuth2Config };
  setAuth: (c: Partial<typeof auth>) => void
}) {
  const { fetchOAuth2Token } = useStore()
  const cfg = auth.oauth2 ?? DEFAULT_OAUTH2
  const set = (updates: Partial<OAuth2Config>) =>
    setAuth({ oauth2: { ...cfg, ...updates } })

  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getToken = async () => {
    setFetching(true)
    setError(null)
    try {
      await fetchOAuth2Token(tab.id)
    } catch (e) {
      setError(String(e))
    } finally {
      setFetching(false)
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const tokenExpired = cfg.tokenExpiry ? cfg.tokenExpiry < now : false
  const tokenExpiresIn = cfg.tokenExpiry ? cfg.tokenExpiry - now : null

  return (
    <>
      <div>
        <Label className="mb-1.5 block">Grant Type</Label>
        <Select value={cfg.grantType} onValueChange={(v) => set({ grantType: v as OAuth2Config['grantType'] })}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="client_credentials">Client Credentials</SelectItem>
            <SelectItem value="authorization_code">Authorization Code (UI only)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 block">Token URL</Label>
        <Input value={cfg.tokenUrl} onChange={(e) => set({ tokenUrl: e.target.value })}
          placeholder="https://auth.example.com/oauth/token" className="font-mono text-sm" />
      </div>
      {cfg.grantType === 'authorization_code' && (
        <div>
          <Label className="mb-1.5 block">Auth URL</Label>
          <Input value={cfg.authUrl ?? ''} onChange={(e) => set({ authUrl: e.target.value })}
            placeholder="https://auth.example.com/authorize" className="font-mono text-sm" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block">Client ID</Label>
          <Input value={cfg.clientId} onChange={(e) => set({ clientId: e.target.value })} placeholder="client_id" className="font-mono" />
        </div>
        <div>
          <Label className="mb-1.5 block">Client Secret</Label>
          <Input type="password" value={cfg.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })}
            placeholder="client_secret" className="font-mono" />
        </div>
      </div>
      <div>
        <Label className="mb-1.5 block">Scope <span className="text-muted-foreground/60">(optional)</span></Label>
        <Input value={cfg.scope ?? ''} onChange={(e) => set({ scope: e.target.value || undefined })}
          placeholder="read write" />
      </div>

      {/* Token status */}
      <div className="border border-border rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Token</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs gap-1"
            onClick={getToken}
            disabled={fetching || !cfg.tokenUrl || !cfg.clientId}
          >
            {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {cfg.accessToken ? 'Refresh' : 'Get Token'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {cfg.accessToken && (
          <>
            <div className="font-mono text-[10px] bg-muted/30 rounded p-1.5 break-all text-muted-foreground truncate">
              {cfg.accessToken.slice(0, 60)}…
            </div>
            {tokenExpiresIn !== null && (
              <p className={cn('text-[10px]', tokenExpired ? 'text-destructive' : 'text-muted-foreground')}>
                {tokenExpired ? 'Expired' : `Expires in ${tokenExpiresIn}s`}
              </p>
            )}
          </>
        )}
        {!cfg.accessToken && !fetching && (
          <p className="text-[10px] text-muted-foreground/60">No token yet. Click Get Token.</p>
        )}
      </div>
    </>
  )
}

// ── Extractions editor ────────────────────────────────────────────────────────

function ExtractionsEditor({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  const extractions = tab.extractions ?? []
  const { updateRequestExtractions, collections } = useStore()

  const setExtractions = (exs: ResponseExtraction[]) => {
    update({ extractions: exs })
    // Also persist to saved request if applicable
    if (tab.savedRequestId && tab.collectionId) {
      updateRequestExtractions(tab.collectionId, tab.savedRequestId, exs)
    }
  }

  const addExtraction = () => {
    setExtractions([
      ...extractions,
      { id: crypto.randomUUID(), enabled: true, from: 'body', path: '$.', envVar: '' },
    ])
  }

  const updateEx = (id: string, updates: Partial<ResponseExtraction>) =>
    setExtractions(extractions.map((e) => (e.id === id ? { ...e, ...updates } : e)))

  const deleteEx = (id: string) =>
    setExtractions(extractions.filter((e) => e.id !== id))

  // Get active environment var list for suggestions
  const collection = tab.collectionId ? collections.find((c) => c.id === tab.collectionId) : null
  const activeEnv = collection?.environments?.find((e) => e.id === collection.activeEnvironmentId)
  const envVarNames = activeEnv?.variables.map((v) => v.key) ?? []

  return (
    <div className="flex flex-col h-full">
      {extractions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/50 text-sm p-8 text-center">
          <p>No extractions defined.</p>
          <p className="text-xs">Extract values from response body or headers into environment variables after each request.</p>
          <Button variant="outline" size="sm" className="gap-1 mt-2" onClick={addExtraction}>
            <Plus className="h-3.5 w-3.5" /> Add Extraction
          </Button>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {extractions.map((ex) => (
                <ExtractionRow
                  key={ex.id}
                  extraction={ex}
                  onUpdate={(updates) => updateEx(ex.id, updates)}
                  onDelete={() => deleteEx(ex.id)}
                  lastResponse={tab.response}
                  envVarNames={envVarNames}
                />
              ))}
            </div>
          </ScrollArea>
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-xs h-7" onClick={addExtraction}>
              <Plus className="h-3.5 w-3.5" /> Add Extraction
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ExtractionRow({
  extraction, onUpdate, onDelete, lastResponse, envVarNames,
}: {
  extraction: ResponseExtraction
  onUpdate: (u: Partial<ResponseExtraction>) => void
  onDelete: () => void
  lastResponse?: import('../types').ResponseData
  envVarNames: string[]
}) {
  const [testResult, setTestResult] = useState<string | undefined>()
  const [testing, setTesting] = useState(false)

  const test = async () => {
    if (!lastResponse) return
    setTesting(true)
    try {
      const result = testExtraction(lastResponse, extraction)
      setTestResult(result ?? '(not found)')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="border border-border rounded p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox checked={extraction.enabled} onCheckedChange={(v) => onUpdate({ enabled: !!v })} />
        <Select value={extraction.from} onValueChange={(v) => onUpdate({ from: v as 'body' | 'header' })}>
          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="body" className="text-xs">Body</SelectItem>
            <SelectItem value="header" className="text-xs">Header</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={extraction.path}
          onChange={(e) => onUpdate({ path: e.target.value })}
          placeholder={extraction.from === 'body' ? '$.data.token' : 'Authorization'}
          className="h-7 flex-1 font-mono text-xs"
        />
        <span className="text-xs text-muted-foreground shrink-0">→</span>
        <Input
          value={extraction.envVar}
          onChange={(e) => onUpdate({ envVar: e.target.value })}
          placeholder="env_var_name"
          list={`envvars-${extraction.id}`}
          className="h-7 flex-1 font-mono text-xs"
        />
        <datalist id={`envvars-${extraction.id}`}>
          {envVarNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={test} disabled={!lastResponse || testing}
          title="Test against last response">
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">▶</span>}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:text-destructive" onClick={onDelete}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {testResult !== undefined && (
        <div className="font-mono text-[10px] bg-muted/30 rounded px-2 py-1 text-muted-foreground">
          {testResult}
        </div>
      )}
    </div>
  )
}

// ── Docs editor ───────────────────────────────────────────────────────────────

function DocsEditor({ tab, update }: { tab: RequestTab; update: (c: Partial<RequestTab>) => void }) {
  const [editing, setEditing] = useState(!tab.description)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent"
        >
          <Pencil className="h-3 w-3" />
          {editing ? 'Preview' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <Textarea
          value={tab.description ?? ''}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Add a description… Markdown supported"
          spellCheck={false}
          className="flex-1 resize-none rounded-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 p-3"
        />
      ) : (
        <ScrollArea className="flex-1">
          {tab.description ? (
            <div
              className="p-4 prose prose-sm prose-invert max-w-none text-foreground/80 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(tab.description) }}
            />
          ) : (
            <div className="p-4 text-muted-foreground/40 text-sm italic">No description yet. Click Edit to add one.</div>
          )}
        </ScrollArea>
      )}
    </div>
  )
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n/g, '<br />')
}
