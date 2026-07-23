'use client'

import React, { useMemo, useState } from 'react'
import { contrastRatio, getThemeOptions } from '@/src/styles/themes'
import { useTheme } from '@/src/components/providers/ThemeProvider'

export function ThemeSwitcher() {
  const { themeMode, setThemeMode } = useTheme()
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)
  const themes = useMemo(() => getThemeOptions(), [])

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Theme</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Switch between standard and high-contrast modes.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {themes.map((theme) => {
          const isActive = themeMode === theme.id
          const ratio = contrastRatio(theme.colors.foreground, theme.colors.background)
          const showRatio = hoveredTheme === theme.id

          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setThemeMode(theme.id)}
              onMouseEnter={() => setHoveredTheme(theme.id)}
              onMouseLeave={() => setHoveredTheme(null)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${isActive ? 'ring-2 ring-offset-2 ring-zinc-500 dark:ring-zinc-300' : 'hover:border-zinc-400 dark:hover:border-zinc-600'}`}
              style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
            >
              <span
                className="flex h-10 w-10 shrink-0 rounded-full border"
                style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold" style={{ color: theme.colors.foreground }}>
                  {theme.label}
                </span>
                <span className="block text-xs" style={{ color: theme.colors.muted }}>
                  {theme.description}
                </span>
                {showRatio ? (
                  <span className="mt-1 block text-[11px] font-medium" style={{ color: theme.colors.primary }}>
                    Contrast {ratio.toFixed(1)}:1
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
