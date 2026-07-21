'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { writeClipboardText, readClipboardText, type ClipboardFallbackAttempt } from '@/utils/clipboardFallback'
import { sanitize, type ClipboardExpectedFormat } from '@/utils/clipboardSanitizer'
import { logClipboardAccess, type ClipboardAuditAction } from '@/utils/clipboardAuditLogger'

export type ClipboardPermissionState = PermissionState | 'unsupported' | 'unknown'

export interface ClipboardSanitizedOptions {
  fieldName?: string
  sensitive?: boolean
  clearAfterMs?: number
}

export interface ClipboardActionState {
  action: ClipboardAuditAction
  fieldName: string
  payloadLength: number
  attempts: ClipboardFallbackAttempt[]
}

const defaultClearAfterMs = 30_000
const clipboardDeniedMessage = 'Clipboard access is blocked. Enable clipboard permissions for this site, or use the browser paste shortcut.'

async function queryClipboardWritePermission(): Promise<ClipboardPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported'
  }

  try {
    const status = await navigator.permissions.query({ name: 'clipboard-write' as PermissionName })
    return status.state
  } catch {
    return 'unsupported'
  }
}

export function useClipboardSanitized(defaultOptions: ClipboardSanitizedOptions = {}) {
  const [lastAction, setLastAction] = useState<ClipboardActionState | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [permissionState, setPermissionState] = useState<ClipboardPermissionState>('unknown')
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
  }, [])

  const clearSensitiveClipboard = useCallback(async (fieldName = defaultOptions.fieldName ?? 'clipboard') => {
    try {
      const result = await writeClipboardText('')
      logClipboardAccess({
        field_name: fieldName,
        action: 'clear',
        payload_length: 0,
        sanitization_status: 'skipped',
      })
      setLastAction({ action: 'clear', fieldName, payloadLength: 0, attempts: result.attempts })
      setError(null)
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught))
      setError(nextError)
      throw nextError
    }
  }, [defaultOptions.fieldName])

  const write = useCallback(async (
    text: string,
    expectedFormat: ClipboardExpectedFormat,
    options: ClipboardSanitizedOptions = {},
  ) => {
    const fieldName = options.fieldName ?? defaultOptions.fieldName ?? 'clipboard'
    const sensitive = options.sensitive ?? defaultOptions.sensitive ?? true
    const clearAfterMs = options.clearAfterMs ?? defaultOptions.clearAfterMs ?? defaultClearAfterMs

    try {
      const nextPermissionState = await queryClipboardWritePermission()
      setPermissionState(nextPermissionState)

      if (nextPermissionState === 'denied') {
        throw new Error(clipboardDeniedMessage)
      }

      const { sanitized } = sanitize(text, expectedFormat)
      const result = await writeClipboardText(sanitized)

      logClipboardAccess({
        field_name: fieldName,
        action: 'write',
        payload_length: sanitized.length,
        sanitization_status: 'sanitized',
      })
      setLastAction({ action: 'write', fieldName, payloadLength: sanitized.length, attempts: result.attempts })
      setError(null)

      clearTimer()
      if (sensitive && clearAfterMs > 0) {
        clearTimerRef.current = setTimeout(() => {
          void clearSensitiveClipboard(fieldName)
        }, clearAfterMs)
      }

      return sanitized
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught))
      logClipboardAccess({
        field_name: fieldName,
        action: 'write',
        payload_length: text.length,
        sanitization_status: 'rejected',
      })
      setError(nextError)
      throw nextError
    }
  }, [clearSensitiveClipboard, clearTimer, defaultOptions.clearAfterMs, defaultOptions.fieldName, defaultOptions.sensitive])

  const read = useCallback(async (
    expectedFormat: ClipboardExpectedFormat,
    options: ClipboardSanitizedOptions = {},
  ) => {
    const fieldName = options.fieldName ?? defaultOptions.fieldName ?? 'clipboard'

    try {
      const result = await readClipboardText()
      const raw = result.value ?? ''
      const { sanitized } = sanitize(raw, expectedFormat)

      logClipboardAccess({
        field_name: fieldName,
        action: 'read',
        payload_length: sanitized.length,
        sanitization_status: 'sanitized',
      })
      setLastAction({ action: 'read', fieldName, payloadLength: sanitized.length, attempts: result.attempts })
      setError(null)
      return sanitized
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught))
      logClipboardAccess({
        field_name: fieldName,
        action: 'read',
        payload_length: 0,
        sanitization_status: 'rejected',
      })
      setError(nextError)
      throw nextError
    }
  }, [defaultOptions.fieldName])

  useEffect(() => clearTimer, [clearTimer])

  return {
    read,
    write,
    clear: clearSensitiveClipboard,
    lastAction,
    error,
    permissionState,
    permissionDeniedMessage: clipboardDeniedMessage,
  }
}
