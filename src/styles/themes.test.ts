import { describe, expect, it } from 'vitest'
import { contrastRatio, getThemeById, getThemeOptions } from './themes'

describe('theme contrast helpers', () => {
  it('exposes the new high-contrast themes', () => {
    const themes = getThemeOptions()
    expect(themes.map((theme) => theme.id)).toEqual(['light', 'dark', 'hc-dark', 'hc-light'])
    expect(getThemeById('hc-dark').label).toBe('High Contrast Dark')
    expect(getThemeById('hc-light').label).toBe('High Contrast Light')
  })

  it('returns a contrast ratio above the WCAG AAA target for high-contrast text', () => {
    const ratio = contrastRatio('#F5F5F5', '#000000')
    expect(ratio).toBeGreaterThan(7)
  })
})
