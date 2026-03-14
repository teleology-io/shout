import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

type UpdaterState = {
  update: Update | null
  isChecking: boolean
  isDownloading: boolean
  progress: number
  error: string | null
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({
    update: null,
    isChecking: false,
    isDownloading: false,
    progress: 0,
    error: null,
  })

  useEffect(() => {
    // Delay the check so it doesn't slow down startup
    const timer = setTimeout(async () => {
      try {
        setState(s => ({ ...s, isChecking: true }))
        const update = await check()
        setState(s => ({ ...s, update: update ?? null, isChecking: false }))
      } catch {
        // Silently ignore — expected in dev mode or when offline
        setState(s => ({ ...s, isChecking: false }))
      }
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  const applyUpdate = async () => {
    if (!state.update) return
    setState(s => ({ ...s, isDownloading: true, progress: 0, error: null }))
    try {
      let downloaded = 0
      let total = 0
      await state.update.downloadAndInstall(event => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setState(s => ({
            ...s,
            progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
          }))
        } else if (event.event === 'Finished') {
          setState(s => ({ ...s, progress: 100 }))
        }
      })
      await relaunch()
    } catch (err) {
      setState(s => ({ ...s, isDownloading: false, error: String(err) }))
    }
  }

  const dismiss = () => setState(s => ({ ...s, update: null, error: null }))

  return { ...state, applyUpdate, dismiss }
}
