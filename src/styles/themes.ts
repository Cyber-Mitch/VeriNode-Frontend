import { tokenPalette } from './colors'

export type ThemeMode = 'light' | 'dark' | 'hc-dark' | 'hc-light'

export interface ThemeDefinition {
  id: ThemeMode
  label: string
  description: string
  colors: {
    background: string
    foreground: string
    surface: string
    border: string
    muted: string
    primary: string
    primaryForeground: string
    destructive: string
    success: string
  }
}

function createTheme(id: ThemeMode, label: string, description: string): ThemeDefinition {
  const colors = tokenPalette[id]
  return { id, label, description, colors }
}

export const themeDefinitions: ThemeDefinition[] = [
  createTheme('light', 'Light', 'Default light mode for office use.'),
  createTheme('dark', 'Dark', 'Standard dark mode with the existing contrast profile.'),
  createTheme('hc-dark', 'High Contrast Dark', 'High-contrast palette tuned for dim server rooms.'),
  createTheme('hc-light', 'High Contrast Light', 'High-contrast palette tuned for bright NOC floors.'),
]

const themeMap = new Map(themeDefinitions.map((theme) => [theme.id, theme]))

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '')
  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned

  const value = Number.parseInt(expanded, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function relativeLuminance(color: string): number {
  const { r, g, b } = parseHexColor(color)
  const rgb = [r, g, b].map((component) => {
    const normalized = component / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

export function getThemeById(id: ThemeMode | string | null | undefined): ThemeDefinition {
  return themeMap.get((id as ThemeMode) ?? 'dark') ?? themeDefinitions[1]
}

export function getThemeOptions(): ThemeDefinition[] {
  return [...themeDefinitions]
}
