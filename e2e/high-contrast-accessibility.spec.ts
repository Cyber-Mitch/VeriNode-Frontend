import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const routes = ['/', '/network', '/validators']

for (const theme of ['hc-dark', 'hc-light'] as const) {
  test.describe(`high-contrast ${theme} accessibility`, () => {
    test(`passes axe checks on core routes in ${theme}`, async ({ page }) => {
      await page.goto('/')
      await page.evaluate((mode) => {
        window.localStorage.setItem('verinode-theme', mode)
      }, theme)
      await page.reload()

      for (const route of routes) {
        await page.goto(route)
        const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
        expect(accessibilityScanResults.violations.filter((violation) => violation.id === 'color-contrast')).toEqual([])
      }
    })
  })
}
