'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ThemeMode } from '@/src/styles/themes'

interface ThemeContextValue {
  themeMode: ThemeMode
  setThemeMode: (theme: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'verinode-theme'

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY)
  return storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'hc-dark' || storedTheme === 'hc-light'
    ? storedTheme
    : 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = themeMode
    root.classList.toggle('dark', themeMode === 'dark' || themeMode === 'hc-dark')
    root.style.colorScheme = themeMode === 'light' || themeMode === 'hc-light' ? 'light' : 'dark'
    window.localStorage.setItem(STORAGE_KEY, themeMode)
  }, [themeMode])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      setThemeMode: (nextTheme) => setThemeModeState(nextTheme),
    }),
    [themeMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
