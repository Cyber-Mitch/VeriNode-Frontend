'use client'

/**
 * Toggle for push notification subscription when a validator is within 10
 * positions of exit. Requests browser Notification permission on first enable.
 * Renders nothing when the Notifications API is unavailable.
 */
export function ExitNotification({
  validatorIndex,
  enabled,
  onToggle,
}: {
  validatorIndex: number
  enabled: boolean
  onToggle: () => void
}) {
  // Hide when the Notifications API is not supported (e.g., in SSR or Safari iOS).
  if (typeof window !== 'undefined' && !('Notification' in window)) {
    return null
  }

  const isBlocked =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'denied'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-200">
          Exit notifications
        </p>
        <p className="text-xs text-slate-500">
          {isBlocked
            ? 'Notifications are blocked — allow them in browser settings'
            : `Alert when validator #${validatorIndex} is within 10 positions of exit`}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={isBlocked}
        aria-pressed={enabled}
        aria-label={
          enabled
            ? `Disable exit notifications for validator ${validatorIndex}`
            : `Enable exit notifications for validator ${validatorIndex}`
        }
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${
          enabled ? 'bg-sky-500' : 'bg-slate-700'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
