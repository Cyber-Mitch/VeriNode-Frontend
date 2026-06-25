'use client'

import { useEffect, useRef, useState } from 'react'
import type { AlertSeverity, LedgerEvent } from '@/src/types/ledgerEvents'
import { playAlertTone, primeAlertAudio } from '@/src/utils/alertSound'
import { captureUnknownLedgerEvent } from '@/src/services/sentry'

interface AlertBannerProps {
  events: LedgerEvent[]
  /** Audible alert for high-severity events. Off by default. */
  soundEnabled?: boolean
  onToggleSound?: (enabled: boolean) => void
}

const SEVERITY_STYLES: Record<AlertSeverity, { border: string; chip: string; dot: string }> = {
  error: { border: 'border-l-red-500', chip: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  warning: { border: 'border-l-yellow-500', chip: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  success: { border: 'border-l-green-500', chip: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  info: { border: 'border-l-zinc-400', chip: 'bg-zinc-100 text-zinc-700', dot: 'bg-zinc-400' },
}

function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function truncate(s: string, head = 6, tail = 4): string {
  if (!s || s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

/** Build a short, type-specific detail line for a decoded event. */
function detailText(event: LedgerEvent): string {
  switch (event.type) {
    case 'approve_attestation':
      return `Node ${truncate(event.nodeId)} · attestation ${truncate(event.attestationId)}`
    case 'reject_attestation':
      return `Node ${truncate(event.nodeId)} · ${event.reason || 'rejected'}`
    case 'slash_node':
      return `Node ${truncate(event.nodeId)} slashed ${event.amount}${event.reason ? ` · ${event.reason}` : ''}`
    case 'reward_distributed':
      return `Node ${truncate(event.nodeId)} · +${event.amount}`
    case 'node_registered':
      return `Node ${truncate(event.nodeId)} · operator ${truncate(event.operator)}`
    case 'node_deregistered':
      return `Node ${truncate(event.nodeId)}${event.reason ? ` · ${event.reason}` : ''}`
    case 'parameter_changed':
      return `${event.key}: ${event.oldValue} → ${event.newValue}`
    case 'unknown':
      return `Raw: 0x${(event.rawTopics[0] ?? '').slice(0, 16)}…`
  }
}

/** Details deep-link for events that map to a node. */
function detailsHref(event: LedgerEvent): string | null {
  if ('nodeId' in event && event.nodeId) {
    return `/network?node=${encodeURIComponent(event.nodeId)}`
  }
  return null
}

function UnknownActions({ event }: { event: LedgerEvent & { type: 'unknown' } }) {
  const [copied, setCopied] = useState(false)
  const [reported, setReported] = useState(false)

  const copyRaw = async () => {
    const payload = JSON.stringify({ topics: event.rawTopics, body: event.rawBody })
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const report = () => {
    void captureUnknownLedgerEvent({
      signature: event.signature,
      rawTopics: event.rawTopics,
      rawBody: event.rawBody,
    })
    setReported(true)
  }

  return (
    <div className="mt-1 flex items-center gap-3 text-xs">
      <button onClick={copyRaw} className="font-medium text-zinc-600 underline hover:text-zinc-900">
        {copied ? 'Copied' : 'Copy Raw'}
      </button>
      <button
        onClick={report}
        disabled={reported}
        className="font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
      >
        {reported ? 'Reported' : 'Report Unknown Event'}
      </button>
    </div>
  )
}

/**
 * Real-time alert panel for decoded Soroban contract log events. Renders each
 * event with a human-readable title, severity color coding, a details link and
 * a relative timestamp. Unknown events degrade to a raw-hex fallback with copy
 * and report affordances. High-severity events (slash / reject) optionally play
 * an audible tone.
 */
export function AlertBanner({ events, soundEnabled = false, onToggleSound }: AlertBannerProps) {
  const lastHighSeverityId = useRef<string | null>(events.find((e) => e.highSeverity)?.id ?? null)
  // Re-render relative timestamps roughly once per second.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Ring the alert when a *new* high-severity event arrives and sound is on.
  useEffect(() => {
    const newest = events.find((e) => e.highSeverity)
    if (newest && newest.id !== lastHighSeverityId.current) {
      lastHighSeverityId.current = newest.id
      if (soundEnabled) playAlertTone()
    }
  }, [events, soundEnabled])

  if (events.length === 0) return null

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Live Contract Events</h2>
        <button
          onClick={() => {
            primeAlertAudio()
            onToggleSound?.(!soundEnabled)
          }}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? '🔔 Sound on' : '🔕 Sound off'}
        </button>
      </header>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {events.map((event) => {
          const styles = SEVERITY_STYLES[event.severity]
          const href = detailsHref(event)
          return (
            <li key={event.id} className={`border-l-4 ${styles.border} px-4 py-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-2 w-2 rounded-full ${styles.dot}`} />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {event.title}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${styles.chip}`}>
                    {event.severity}
                  </span>
                </div>
                <time className="shrink-0 text-xs text-zinc-400" dateTime={new Date(event.timestamp).toISOString()}>
                  {relativeTime(event.timestamp, now)}
                </time>
              </div>

              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{detailText(event)}</p>

              {event.type === 'unknown' ? (
                <UnknownActions event={event} />
              ) : (
                href && (
                  <a href={href} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:text-blue-800">
                    View details →
                  </a>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
