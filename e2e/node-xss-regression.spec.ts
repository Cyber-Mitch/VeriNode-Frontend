import { expect, test } from '@playwright/test'

// Regression for issue #9: operator-supplied node fields must never execute as
// HTML/JS. We inject malicious values through the URL (standing in for the
// configuration API) and assert nothing executes.
test.describe('Node field XSS regression (#9)', () => {
  test('img/onerror payload in displayName does not execute', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })

    const payload = 'Acme<img src=x onerror=alert(1)>Node'
    await page.goto(`/network?name=${encodeURIComponent(payload)}`)

    const card = page.getByTestId('node-card-injected')
    await expect(card).toBeVisible()

    // No injected element and no script execution.
    await page.waitForTimeout(500)
    expect(dialogs).toHaveLength(0)
    expect(await card.locator('img').count()).toBe(0)

    // The display name renders as sanitized plain text.
    const name = await card.getByTestId('node-display-name').innerText()
    expect(name).toContain('AcmeNode')
    expect(name).not.toContain('<')
    expect(name).not.toContain('onerror')
  })

  test('script payload in description is neutralized', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })

    const payload = '"><script>alert(document.cookie)</script>'
    await page.goto(`/network?description=${encodeURIComponent(payload)}`)

    const card = page.getByTestId('node-card-injected')
    await expect(card).toBeVisible()

    await page.waitForTimeout(500)
    expect(dialogs).toHaveLength(0)
    expect(await card.locator('script').count()).toBe(0)
    const description = await card.getByTestId('node-description').innerText()
    expect(description).not.toContain('<')
  })

  test('sends a Content-Security-Policy with object-src none', async ({ page }) => {
    const response = await page.goto('/network')
    const csp = response?.headers()['content-security-policy'] ?? ''
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('script-src')
  })
})
