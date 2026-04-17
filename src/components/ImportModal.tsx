import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import type { Collection } from '../types'
import { parseOpenApiText, parseOpenApiUrl, parseOpenApiFile } from '../utils/openapi'
import { importPostman, looksLikePostman } from '../utils/importPostman'
import { importInsomnia, looksLikeInsomnia } from '../utils/importInsomnia'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Label } from './ui/label'
import { Upload, FileText, Link, ClipboardPaste } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

type FormatHint = 'auto' | 'openapi' | 'postman' | 'insomnia'

function detectFormat(text: string): FormatHint {
  try {
    const json = JSON.parse(text)
    if (looksLikePostman(json)) return 'postman'
    if (looksLikeInsomnia(json)) return 'insomnia'
  } catch {
    // not JSON — try YAML OpenAPI detection below
  }
  if (text.includes('openapi:') || text.includes('"openapi"') || text.includes('swagger:')) return 'openapi'
  return 'auto'
}

async function parseText(text: string, hint: FormatHint): Promise<Collection> {
  const effective = hint === 'auto' ? detectFormat(text) : hint
  if (effective === 'postman') return importPostman(JSON.parse(text))
  if (effective === 'insomnia') return importInsomnia(JSON.parse(text))
  return parseOpenApiText(text)
}

async function parseFile(file: File, hint: FormatHint): Promise<Collection> {
  if (hint === 'auto') {
    const text = await file.text()
    const fmt = detectFormat(text)
    if (fmt === 'postman') return importPostman(JSON.parse(text))
    if (fmt === 'insomnia') return importInsomnia(JSON.parse(text))
    return parseOpenApiFile(file)
  }
  const text = await file.text()
  return parseText(text, hint)
}

export function ImportModal({ onClose }: Props) {
  const [url, setUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState('file')
  const [format, setFormat] = useState<FormatHint>('auto')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      let collection: Collection
      if (mode === 'file') {
        if (!selectedFile) { setError('Please select a file'); setLoading(false); return }
        collection = await parseFile(selectedFile, format)
      } else if (mode === 'url') {
        if (!url.trim()) { setError('Please enter a URL'); setLoading(false); return }
        // URL mode: fetch text first, then detect
        collection = await parseOpenApiUrl(url.trim())
      } else {
        if (!pasteText.trim()) { setError('Please paste your collection or spec'); setLoading(false); return }
        collection = await parseText(pasteText.trim(), format)
      }

      const { collections } = useStore.getState()
      if (collections.find((c) => c.name === collection.name)) {
        collection = { ...collection, name: `${collection.name} (${Date.now()})` }
      }
      useStore.setState((s) => ({ collections: [...s.collections, collection] }))
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Import Collection
          </DialogTitle>
        </DialogHeader>

        <div className="px-6">
          {/* Format selector */}
          <div className="mb-3 flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Format</Label>
            <div className="flex gap-1">
              {(['auto', 'openapi', 'postman', 'insomnia'] as FormatHint[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-medium transition-colors border',
                    format === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {f === 'auto' ? 'Auto-detect' : f === 'openapi' ? 'OpenAPI' : f === 'postman' ? 'Postman' : 'Insomnia'}
                </button>
              ))}
            </div>
          </div>

          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full border-b border-border">
              <TabsTrigger value="file" className="flex-1 text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" /> File
              </TabsTrigger>
              <TabsTrigger value="url" className="flex-1 text-xs gap-1.5">
                <Link className="h-3.5 w-3.5" /> URL
              </TabsTrigger>
              <TabsTrigger value="paste" className="flex-1 text-xs gap-1.5">
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-4">
              <div
                className={cn(
                  'border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors',
                  selectedFile && 'border-primary/40 bg-primary/5'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yml,.yaml,.json"
                  className="hidden"
                  onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setError(null) }}
                />
                <FileText className={cn('h-10 w-10 mx-auto mb-3', selectedFile ? 'text-primary' : 'text-muted-foreground/30')} />
                {selectedFile ? (
                  <>
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Click to change</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">Click to select a file</p>
                    <p className="text-xs text-muted-foreground mt-1">OpenAPI (.yml/.yaml/.json), Postman (.json), Insomnia (.json)</p>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="url" className="mt-4 space-y-2">
              <Label>OpenAPI specification URL</Label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/openapi.yaml"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground/60">The URL must be publicly accessible from your machine</p>
            </TabsContent>

            <TabsContent value="paste" className="mt-4 space-y-2">
              <Label>Paste collection (OpenAPI, Postman, or Insomnia JSON)</Label>
              <Textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setError(null) }}
                placeholder={'Paste OpenAPI YAML/JSON, Postman v2.1 JSON, or Insomnia v4 export JSON'}
                rows={10}
                className="font-mono text-xs resize-none"
              />
            </TabsContent>
          </Tabs>

          {error && (
            <div className="mt-3 px-3 py-2.5 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-xs">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleImport} disabled={loading} className="gap-1.5">
            {loading ? 'Importing…' : <><Upload className="h-3.5 w-3.5" /> Import</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
