'use client'

interface PermissionToastProps {
  open: boolean
  message: string
  onDismiss?: () => void
}

export function PermissionToast({ open, message, onDismiss }: PermissionToastProps) {
  if (!open) {
    return null
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true">⚠️</span>
        <p className="flex-1">{message}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="font-semibold text-amber-900 opacity-70 hover:opacity-100"
            aria-label="Dismiss clipboard permission message"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  )
}
