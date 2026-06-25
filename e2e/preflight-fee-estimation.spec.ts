import { expect, test } from '@playwright/test'

// Known simulation values: fee = (5_000_000·100 + 5_000·1000 + 10_000·10) / 1e7
//                              = 505_100_000 / 1e7 = 50.51 XLM
const MOCK_COST = { instructions: 5_000_000, writeBytes: 5_000, readBytes: 10_000 }

const MOCK_RESPONSE = {
  success: true,
  cost: MOCK_COST,
  footprint: {
    readWrite: ['CONTRACT_STAKE_LEDGER', 'CONTRACT_BALANCE'],
    readOnly: ['CONTRACT_CONFIG'],
  },
  stateChanges: [{ key: 'CONTRACT_STAKE_LEDGER', kind: 'updated' }],
}

test.describe('Pre-flight fee estimation (#12)', () => {
  test('shows accurate breakdown and gates Approve on simulation completion', async ({ page }) => {
    // (a) Mock the simulation endpoint, with a small delay so we can observe the
    // loading → ready transition.
    await page.route('**/api/v1/simulate/transaction', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RESPONSE),
      })
    })

    await page.goto('/wallet/preflight')

    // (b) Open the TxModal for a stake action.
    await page.getByRole('button', { name: 'Stake', exact: true }).click()
    const modal = page.getByTestId('tx-modal')
    await expect(modal).toBeVisible()

    // (d) While simulating, the skeleton shows and Approve is disabled.
    await expect(page.getByTestId('preflight-skeleton')).toBeVisible()
    await expect(page.getByTestId('approve-wallet')).toBeDisabled()

    // (c) On success, the FeeBreakdown shows the expected resource and fee values.
    await expect(page.getByTestId('fee-instructions')).toHaveText('5,000,000')
    await expect(page.getByTestId('fee-write-bytes')).toHaveText('5,000')
    await expect(page.getByTestId('fee-read-bytes')).toHaveText('10,000')
    await expect(page.getByTestId('fee-xlm')).toContainText('50.51')

    // Real simulation → no "estimated" badge.
    await expect(page.getByTestId('estimated-badge')).toHaveCount(0)

    // (d) Approve becomes enabled only after simulation completes.
    await expect(page.getByTestId('approve-wallet')).toBeEnabled()
  })

  test('falls back to a conservative estimate when simulation fails', async ({ page }) => {
    await page.route('**/api/v1/simulate/transaction', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"rpc down"}' }),
    )

    await page.goto('/wallet/preflight')
    await page.getByRole('button', { name: 'Stake', exact: true }).click()

    // Static estimate from feeEstimates.json (stake) is shown with a badge,
    // and Approve is still enabled.
    await expect(page.getByTestId('estimated-badge')).toBeVisible()
    await expect(page.getByTestId('fee-instructions')).toHaveText('5,000,000')
    await expect(page.getByTestId('approve-wallet')).toBeEnabled()
  })
})
