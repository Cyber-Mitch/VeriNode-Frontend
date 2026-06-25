'use client'

import { useCallback, useMemo, useReducer } from 'react'

// Per-node attestation status shown as a colored indicator:
//   attested → green   pending → yellow   slashed → red
export type AttestationStatus = 'pending' | 'attested' | 'slashed'

/**
 * A status event from the WebSocket stream. `seq` is a per-node monotonic
 * sequence number assigned at the source; it is the authority on recency,
 * because TCP guarantees delivery but async boundaries can reorder processing.
 */
export interface NodeStatusEvent {
  nodeId: string
  status: AttestationStatus
  seq: number
  /** Optional source timestamp (ms), informational only. */
  ts?: number
}

interface NodeRecord {
  status: AttestationStatus
  seq: number
}

export type NodeStatusState = Record<string, NodeRecord>

export type NodeStatusAction = { type: 'apply'; events: NodeStatusEvent[] } | { type: 'reset' }

/**
 * The status transition DAG. Only these directed edges are legal:
 *   pending → attested → slashed   and   slashed → attested (dispute won)
 * A same-status re-assert is idempotent. Every other transition (e.g.
 * attested → pending) is illegal and indicates a reordered/stale event.
 */
const VALID_TRANSITIONS: Record<AttestationStatus, ReadonlyArray<AttestationStatus>> = {
  pending: ['attested'],
  attested: ['slashed'],
  slashed: ['attested'],
}

export function isValidTransition(from: AttestationStatus, to: AttestationStatus): boolean {
  if (from === to) return true
  return VALID_TRANSITIONS[from].includes(to)
}

/**
 * Collapse a batch of events to the latest (highest-seq) event per node. The
 * 50 ms stream buffer uses this so rapid back-and-forth transitions become a
 * single update — at most one per node per window.
 */
export function dedupeLatestPerNode(events: NodeStatusEvent[]): NodeStatusEvent[] {
  const latest = new Map<string, NodeStatusEvent>()
  for (const event of events) {
    const current = latest.get(event.nodeId)
    if (!current || event.seq > current.seq) latest.set(event.nodeId, event)
  }
  return [...latest.values()]
}

/**
 * Pure reducer over a batch of events. Two guards enforce the invariant
 * `displayed_status == latest_known_status`:
 *
 *   1. Sequence guard — an event is ignored unless `seq` is strictly greater
 *      than the node's last applied seq, so a stale (reordered) event can never
 *      overwrite a newer state.
 *   2. Transition DAG — a strictly-newer event whose transition is illegal is
 *      dropped without mutating state (and without advancing seq), so a future
 *      legitimate event is not locked out.
 *
 * Events are processed in ascending seq order, so the result is independent of
 * the arrival order within the batch.
 */
export function reduceNodeStatus(
  state: NodeStatusState,
  events: NodeStatusEvent[],
): NodeStatusState {
  if (events.length === 0) return state
  const ordered = [...events].sort((a, b) => a.seq - b.seq)

  let next: NodeStatusState | null = null
  for (const event of ordered) {
    const current = (next ?? state)[event.nodeId]
    if (current) {
      if (event.seq <= current.seq) continue // sequence guard
      if (!isValidTransition(current.status, event.status)) continue // transition DAG
    }
    next = next ?? { ...state }
    next[event.nodeId] = { status: event.status, seq: event.seq }
  }
  return next ?? state
}

function reducer(state: NodeStatusState, action: NodeStatusAction): NodeStatusState {
  switch (action.type) {
    case 'apply':
      return reduceNodeStatus(state, action.events)
    case 'reset':
      return {}
  }
}

export interface UseNodeStatusResult {
  statuses: Record<string, AttestationStatus>
  getStatus: (nodeId: string) => AttestationStatus | undefined
  applyEvents: (events: NodeStatusEvent[]) => void
  reset: () => void
}

/**
 * Reducer-backed node attestation status store. Replaces per-event
 * `setState(prev => …)` (which let stale events win under reordering) with an
 * ordered, guarded merge: the latest event per node always wins, illegal
 * transitions are silently dropped.
 */
export function useNodeStatus(initial: NodeStatusState = {}): UseNodeStatusResult {
  const [state, dispatch] = useReducer(reducer, initial)

  const applyEvents = useCallback(
    (events: NodeStatusEvent[]) => dispatch({ type: 'apply', events }),
    [],
  )
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  const statuses = useMemo(() => {
    const out: Record<string, AttestationStatus> = {}
    for (const id of Object.keys(state)) out[id] = state[id].status
    return out
  }, [state])

  const getStatus = useCallback((nodeId: string) => state[nodeId]?.status, [state])

  return { statuses, getStatus, applyEvents, reset }
}
