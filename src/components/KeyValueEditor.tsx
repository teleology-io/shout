import { useStore } from '../store/useStore'
import type { KeyValue } from '../types'
import { newKeyValue } from '../types'
import { useCollectionEnvVars } from '../utils/envVars'
import { VarValueCell } from './VarText'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Plus, X } from 'lucide-react'

interface Props {
  tabId: string
  field: 'headers' | 'params'
}

export function KeyValueEditor({ tabId, field }: Props) {
  const { tabs, updateTab } = useStore()
  const tab = tabs.find((t) => t.id === tabId)
  const vars = useCollectionEnvVars(tab?.collectionId)
  if (!tab) return null

  const items: KeyValue[] = tab[field]

  const update = (updated: KeyValue[]) => updateTab(tabId, { [field]: updated } as never)
  const addRow = () => update([...items, newKeyValue()])
  const updateRow = (id: string, changes: Partial<KeyValue>) =>
    update(items.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  const removeRow = (id: string) => update(items.filter((item) => item.id !== id))

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
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/50 group hover:bg-accent/30">
                <td className="p-1.5 text-center">
                  <Checkbox
                    checked={item.enabled}
                    onCheckedChange={(v) => updateRow(item.id, { enabled: !!v })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={item.key}
                    placeholder="Key"
                    onChange={(e) => updateRow(item.id, { key: e.target.value })}
                    className="h-7 border-0 bg-transparent shadow-none focus-visible:bg-input focus-visible:ring-0 font-mono text-xs px-1"
                  />
                </td>
                <td className="p-1">
                  <VarValueCell
                    value={item.value}
                    vars={vars}
                    onChange={(v) => updateRow(item.id, { value: v })}
                  />
                </td>
                <td className="p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                    onClick={() => removeRow(item.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      <div className="border-t border-border p-1.5">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-xs h-7" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
          Add {field === 'headers' ? 'Header' : 'Parameter'}
        </Button>
      </div>
    </div>
  )
}
