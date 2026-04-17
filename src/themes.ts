export interface Theme {
  id: string
  name: string
  isDark: boolean
  // HSL components for each CSS variable (without the hsl() wrapper)
  vars: {
    background: string
    foreground: string
    card: string
    'card-foreground': string
    popover: string
    'popover-foreground': string
    primary: string
    'primary-foreground': string
    secondary: string
    'secondary-foreground': string
    muted: string
    'muted-foreground': string
    accent: string
    'accent-foreground': string
    destructive: string
    'destructive-foreground': string
    border: string
    input: string
    ring: string
  }
  // Accent swatch colors for the picker preview
  swatch: { bg: string; accent: string }
}

export const THEMES: Theme[] = [
  {
    id: 'shout-dark',
    name: 'Shout Dark',
    isDark: true,
    swatch: { bg: '#0b0b0e', accent: '#ff4757' },
    vars: {
      background: '240 10% 4%',
      foreground: '0 0% 83%',
      card: '240 6% 10%',
      'card-foreground': '0 0% 83%',
      popover: '240 5% 12%',
      'popover-foreground': '0 0% 83%',
      primary: '354 100% 64%',
      'primary-foreground': '0 0% 100%',
      secondary: '240 4% 16%',
      'secondary-foreground': '0 0% 83%',
      muted: '240 4% 16%',
      'muted-foreground': '0 0% 53%',
      accent: '240 4% 20%',
      'accent-foreground': '0 0% 83%',
      destructive: '0 84% 60%',
      'destructive-foreground': '0 0% 100%',
      border: '240 4% 18%',
      input: '240 4% 13%',
      ring: '354 100% 64%',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    isDark: true,
    swatch: { bg: '#0a0e1a', accent: '#4a9eff' },
    vars: {
      background: '222 40% 7%',
      foreground: '214 32% 85%',
      card: '222 35% 11%',
      'card-foreground': '214 32% 85%',
      popover: '222 33% 13%',
      'popover-foreground': '214 32% 85%',
      primary: '214 100% 64%',
      'primary-foreground': '0 0% 100%',
      secondary: '222 28% 16%',
      'secondary-foreground': '214 32% 85%',
      muted: '222 28% 16%',
      'muted-foreground': '214 20% 50%',
      accent: '222 25% 20%',
      'accent-foreground': '214 32% 85%',
      destructive: '0 84% 60%',
      'destructive-foreground': '0 0% 100%',
      border: '222 28% 18%',
      input: '222 30% 14%',
      ring: '214 100% 64%',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    isDark: true,
    swatch: { bg: '#0a130c', accent: '#4caf7d' },
    vars: {
      background: '130 30% 6%',
      foreground: '140 20% 82%',
      card: '130 25% 10%',
      'card-foreground': '140 20% 82%',
      popover: '130 22% 12%',
      'popover-foreground': '140 20% 82%',
      primary: '152 56% 48%',
      'primary-foreground': '0 0% 100%',
      secondary: '130 18% 16%',
      'secondary-foreground': '140 20% 82%',
      muted: '130 18% 16%',
      'muted-foreground': '130 12% 50%',
      accent: '130 16% 20%',
      'accent-foreground': '140 20% 82%',
      destructive: '0 84% 60%',
      'destructive-foreground': '0 0% 100%',
      border: '130 18% 17%',
      input: '130 20% 13%',
      ring: '152 56% 48%',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    isDark: true,
    swatch: { bg: '#282a36', accent: '#bd93f9' },
    vars: {
      background: '231 15% 18%',
      foreground: '60 30% 96%',
      card: '232 14% 21%',
      'card-foreground': '60 30% 96%',
      popover: '232 13% 23%',
      'popover-foreground': '60 30% 96%',
      primary: '265 89% 78%',
      'primary-foreground': '231 15% 18%',
      secondary: '232 12% 27%',
      'secondary-foreground': '60 30% 96%',
      muted: '232 12% 27%',
      'muted-foreground': '232 10% 60%',
      accent: '232 10% 32%',
      'accent-foreground': '60 30% 96%',
      destructive: '0 84% 60%',
      'destructive-foreground': '0 0% 100%',
      border: '232 12% 28%',
      input: '232 13% 24%',
      ring: '265 89% 78%',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    isDark: false,
    swatch: { bg: '#ffffff', accent: '#0969da' },
    vars: {
      background: '0 0% 100%',
      foreground: '215 25% 15%',
      card: '210 17% 98%',
      'card-foreground': '215 25% 15%',
      popover: '0 0% 100%',
      'popover-foreground': '215 25% 15%',
      primary: '212 100% 45%',
      'primary-foreground': '0 0% 100%',
      secondary: '210 14% 93%',
      'secondary-foreground': '215 25% 15%',
      muted: '210 14% 93%',
      'muted-foreground': '215 15% 45%',
      accent: '210 14% 89%',
      'accent-foreground': '215 25% 15%',
      destructive: '0 84% 45%',
      'destructive-foreground': '0 0% 100%',
      border: '210 14% 89%',
      input: '210 14% 91%',
      ring: '212 100% 45%',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    isDark: false,
    swatch: { bg: '#fdf6e3', accent: '#268bd2' },
    vars: {
      background: '44 87% 94%',
      foreground: '192 95% 18%',
      card: '44 70% 91%',
      'card-foreground': '192 95% 18%',
      popover: '44 70% 91%',
      'popover-foreground': '192 95% 18%',
      primary: '205 69% 49%',
      'primary-foreground': '0 0% 100%',
      secondary: '44 55% 87%',
      'secondary-foreground': '192 95% 18%',
      muted: '44 55% 87%',
      'muted-foreground': '186 16% 40%',
      accent: '44 45% 83%',
      'accent-foreground': '192 95% 18%',
      destructive: '1 71% 52%',
      'destructive-foreground': '0 0% 100%',
      border: '44 45% 84%',
      input: '44 55% 88%',
      ring: '205 69% 49%',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    isDark: true,
    swatch: { bg: '#2e3440', accent: '#88c0d0' },
    vars: {
      background: '220 16% 22%',
      foreground: '218 27% 88%',
      card: '222 16% 26%',
      'card-foreground': '218 27% 88%',
      popover: '222 14% 28%',
      'popover-foreground': '218 27% 88%',
      primary: '193 43% 67%',
      'primary-foreground': '220 16% 22%',
      secondary: '222 14% 32%',
      'secondary-foreground': '218 27% 88%',
      muted: '222 14% 32%',
      'muted-foreground': '218 20% 58%',
      accent: '222 12% 36%',
      'accent-foreground': '218 27% 88%',
      destructive: '354 42% 56%',
      'destructive-foreground': '0 0% 100%',
      border: '222 14% 30%',
      input: '222 15% 27%',
      ring: '193 43% 67%',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    isDark: true,
    swatch: { bg: '#000000', accent: '#ffff00' },
    vars: {
      background: '0 0% 0%',
      foreground: '0 0% 100%',
      card: '0 0% 7%',
      'card-foreground': '0 0% 100%',
      popover: '0 0% 10%',
      'popover-foreground': '0 0% 100%',
      primary: '60 100% 50%',
      'primary-foreground': '0 0% 0%',
      secondary: '0 0% 15%',
      'secondary-foreground': '0 0% 100%',
      muted: '0 0% 15%',
      'muted-foreground': '0 0% 70%',
      accent: '0 0% 20%',
      'accent-foreground': '0 0% 100%',
      destructive: '0 100% 55%',
      'destructive-foreground': '0 0% 100%',
      border: '0 0% 25%',
      input: '0 0% 12%',
      ring: '60 100% 50%',
    },
  },
]

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(`--${key}`, value)
  }
  if (theme.isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}
