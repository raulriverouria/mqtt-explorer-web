import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeStore {
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
}

const THEME_KEY = 'mqtt-explorer-theme'

const getSavedTheme = (): ThemeMode => {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved
  }
  return 'system'
}

export const useThemeStore = create<ThemeStore>((set) => ({
  themeMode: getSavedTheme(),
  setThemeMode: (mode) => {
    localStorage.setItem(THEME_KEY, mode)
    set({ themeMode: mode })
    applyTheme(mode)
  }
}))

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  let activeTheme: 'light' | 'dark' = 'dark'

  if (mode === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    activeTheme = isDark ? 'dark' : 'light'
  } else {
    activeTheme = mode
  }

  root.setAttribute('data-theme', activeTheme)
}

// Set up media query listener for system theme changes
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    const currentMode = localStorage.getItem(THEME_KEY) as ThemeMode || 'system'
    if (currentMode === 'system') {
      applyTheme('system')
    }
  })
}
