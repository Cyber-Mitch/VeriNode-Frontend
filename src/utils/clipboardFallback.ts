export interface ClipboardFallbackAttempt {
  method: string
  success: boolean
  error?: string
}

export interface ClipboardFallbackResult<T> {
  value?: T
  attempts: ClipboardFallbackAttempt[]
}

function recordFailure(attempts: ClipboardFallbackAttempt[], method: string, error: unknown): void {
  attempts.push({
    method,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  })
}

function createHiddenTextarea(value = ''): HTMLTextAreaElement {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  return textarea
}

export async function writeClipboardText(text: string): Promise<ClipboardFallbackResult<void>> {
  const attempts: ClipboardFallbackAttempt[] = []

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      attempts.push({ method: 'navigator.clipboard.writeText', success: true })
      return { attempts }
    } catch (error) {
      recordFailure(attempts, 'navigator.clipboard.writeText', error)
    }
  }

  if (typeof document !== 'undefined' && document.queryCommandSupported?.('copy')) {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const textarea = createHiddenTextarea(text)

    try {
      if (document.execCommand('copy')) {
        attempts.push({ method: 'document.execCommand(copy)', success: true })
        return { attempts }
      }

      throw new Error('document.execCommand(copy) returned false')
    } catch (error) {
      recordFailure(attempts, 'document.execCommand(copy)', error)
    } finally {
      textarea.remove()
      previousActiveElement?.focus()
    }
  }

  throw new Error(`Unable to write clipboard text. Attempts: ${attempts.map(attempt => attempt.method).join(', ')}`)
}

export async function readClipboardText(): Promise<ClipboardFallbackResult<string>> {
  const attempts: ClipboardFallbackAttempt[] = []

  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      const value = await navigator.clipboard.readText()
      attempts.push({ method: 'navigator.clipboard.readText', success: true })
      return { value, attempts }
    } catch (error) {
      recordFailure(attempts, 'navigator.clipboard.readText', error)
    }
  }

  if (typeof document !== 'undefined' && document.queryCommandSupported?.('paste')) {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const textarea = createHiddenTextarea()

    try {
      if (document.execCommand('paste')) {
        attempts.push({ method: 'document.execCommand(paste)', success: true })
        return { value: textarea.value, attempts }
      }

      throw new Error('document.execCommand(paste) returned false')
    } catch (error) {
      recordFailure(attempts, 'document.execCommand(paste)', error)
    } finally {
      textarea.remove()
      previousActiveElement?.focus()
    }
  }

  if (typeof document !== 'undefined') {
    const value = await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        document.removeEventListener('paste', handlePaste)
        reject(new Error('Timed out waiting for ClipboardEvent paste data'))
      }, 1000)

      function handlePaste(event: ClipboardEvent) {
        window.clearTimeout(timeout)
        document.removeEventListener('paste', handlePaste)
        event.preventDefault()
        resolve(event.clipboardData?.getData('text/plain') ?? '')
      }

      document.addEventListener('paste', handlePaste, { once: true })
    })

    attempts.push({ method: 'ClipboardEvent(paste)', success: true })
    return { value, attempts }
  }

  throw new Error(`Unable to read clipboard text. Attempts: ${attempts.map(attempt => attempt.method).join(', ')}`)
}
