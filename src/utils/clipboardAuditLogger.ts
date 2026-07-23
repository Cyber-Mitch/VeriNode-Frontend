export type ClipboardAuditAction = 'read' | 'write' | 'clear'
export type ClipboardSanitizationStatus = 'sanitized' | 'rejected' | 'skipped'

export interface ClipboardAuditEvent {
  timestamp: string
  field_name: string
  action: ClipboardAuditAction
  payload_length: number
  sanitization_status: ClipboardSanitizationStatus
}

const maxEvents = 1000
const events: ClipboardAuditEvent[] = []

export function logClipboardAccess(event: Omit<ClipboardAuditEvent, 'timestamp'>): ClipboardAuditEvent {
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
  }

  events.push(entry)

  if (events.length > maxEvents) {
    events.splice(0, events.length - maxEvents)
  }

  return entry
}

export function getClipboardAuditLog(): ClipboardAuditEvent[] {
  return [...events]
}

export function clearClipboardAuditLog(): void {
  events.length = 0
}
