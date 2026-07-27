'use client'

import { useState } from 'react'

/**
 * Congratulatory banner shown when a validator's exit is complete (position ≤ 0).
 * Displays reactivation instructions and can be dismissed.
 */
export function ExitCompleteAlert({
  validatorIndex,
  exitEpoch,
  onDismiss,
}: {
  validatorIndex: number
  exitEpoch: number | null
  onDismiss?: () => void
}) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-2xl" aria-hidden="true">
            🎉
          </span>
          <div>
            <h3 className="font-semibold text-emerald-300">
              Validator #{validatorIndex} has exited
            </h3>
            {exitEpoch !== null && (
              <p className="mt-0.5 text-sm text-emerald-200/80">
                Exit completed at epoch {exitEpoch.toLocaleString()}
              </p>
            )}
            <div className="mt-3 space-y-1.5 text-xs text-emerald-200/70">
              <p className="font-semibold text-emerald-200">To reactivate this validator:</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li>
                  Wait for the full withdrawal to settle (withdrawable epoch must pass before
                  the 32 ETH can be re-staked).
                </li>
                <li>
                  Generate a new BLS key pair and obtain a new deposit data file via the{' '}
                  <span className="font-mono text-emerald-300">ethereum/staking-deposit-cli</span>.
                </li>
                <li>
                  Submit a new 32 ETH deposit transaction to the Ethereum deposit contract.
                </li>
                <li>
                  Wait for the activation queue — your validator will receive a new index.
                </li>
              </ol>
              <p className="mt-2">
                For withdrawal credential changes (0x00 → 0x01), use the{' '}
                <span className="font-mono text-emerald-300">BLSToExecutionChange</span> operation
                before re-depositing.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss exit complete alert"
          className="flex-shrink-0 rounded-lg p-1 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
