import { useEffect } from 'react'
import { THEMES, applyTheme } from '../themes'
import { useStore } from '../store/useStore'

export function useTheme() {
  const themeId = useStore((s) => s.themeId)
  const setThemeId = useStore((s) => s.setThemeId)

  useEffect(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]
    applyTheme(theme)
  }, [themeId])

  const currentTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  return { themeId, setThemeId, themes: THEMES, currentTheme }
}
