import { describe, expect, it } from 'vitest'
import {
  dedupeLatestPerNode,
  isValidTransition,
  reduceNodeStatus,
  type AttestationStatus,
  type NodeStatusEvent,
} from '../useNodeStatus'

const ev = (nodeId: string, status: AttestationStatus, seq: number): NodeStatusEvent => ({
  nodeId,
  status,
  seq,
})

describe('reduceNodeStatus — reordering guards (#35)', () => {
  it('sequence guard: stale lower-seq events never overwrite the latest state', () => {
    // True source order: pending(1) → attested(2) → slashed(3) → attested(4).
    // The final, newest event (seq 4 = attested) is processed first...
    let state = reduceNodeStatus({}, [ev('n1', 'attested', 4)])
    expect(state.n1.status).toBe('attested')

    // ...then the stale, reordered events arrive — each must be ignored.
    state = reduceNodeStatus(state, [ev('n1', 'slashed', 3)])
    state = reduceNodeStatus(state, [ev('n1', 'pending', 1)])
    state = reduceNodeStatus(state, [ev('n1', 'attested', 2)])

    // Invariant: displayed_status == latest_known_status (no green→red→yellow flicker).
    expect(state.n1.status).toBe('attested')
    expect(state.n1.seq).toBe(4)
  })

  it('is order-independent within a batch (events sorted by seq)', () => {
    const batch = [
      ev('n1', 'pending', 1),
      ev('n1', 'attested', 2),
      ev('n1', 'slashed', 3),
      ev('n1', 'attested', 4),
    ]
    const forward = reduceNodeStatus({}, batch)
    const shuffled = reduceNodeStatus({}, [batch[3], batch[1], batch[0], batch[2]])
    expect(forward.n1.status).toBe('attested')
    expect(shuffled.n1).toEqual(forward.n1)
  })

  it('transition DAG: illegal transitions are dropped and do not advance seq', () => {
    let state = reduceNodeStatus({}, [ev('n1', 'attested', 1)])
    // attested → pending is illegal even though seq 2 > seq 1.
    state = reduceNodeStatus(state, [ev('n1', 'pending', 2)])
    expect(state.n1.status).toBe('attested')
    expect(state.n1.seq).toBe(1)
  })

  it('accepts the legal dispute cycle pending→attested→slashed→attested', () => {
    let state = reduceNodeStatus({}, [ev('n1', 'pending', 1)])
    state = reduceNodeStatus(state, [ev('n1', 'attested', 2)])
    state = reduceNodeStatus(state, [ev('n1', 'slashed', 3)])
    state = reduceNodeStatus(state, [ev('n1', 'attested', 4)])
    expect(state.n1.status).toBe('attested')
    expect(state.n1.seq).toBe(4)
  })

  it('keeps node states independent', () => {
    let state = reduceNodeStatus({}, [ev('n1', 'attested', 5), ev('n2', 'pending', 1)])
    // n1 seq 3 ≤ 5 is dropped; n2 advances pending → attested.
    state = reduceNodeStatus(state, [ev('n1', 'slashed', 3), ev('n2', 'attested', 2)])
    expect(state.n1.status).toBe('attested')
    expect(state.n2.status).toBe('attested')
  })
})

describe('dedupeLatestPerNode — 50ms buffer collapse (#35)', () => {
  it('collapses 50 rapid same-node events to the single latest', () => {
    const cycle: AttestationStatus[] = ['pending', 'attested', 'slashed', 'attested']
    const events: NodeStatusEvent[] = []
    for (let seq = 1; seq <= 50; seq++) events.push(ev('n1', cycle[seq % cycle.length], seq))

    const collapsed = dedupeLatestPerNode(events)
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].seq).toBe(50)

    // Applying the collapsed batch yields the latest known status only.
    const state = reduceNodeStatus({}, collapsed)
    expect(state.n1.seq).toBe(50)
    expect(state.n1.status).toBe(cycle[50 % cycle.length])
  })

  it('keeps the latest per node across many nodes', () => {
    const events = [ev('a', 'pending', 1), ev('b', 'pending', 1), ev('a', 'attested', 2)]
    const collapsed = dedupeLatestPerNode(events).sort((x, y) => x.nodeId.localeCompare(y.nodeId))
    expect(collapsed).toHaveLength(2)
    expect(collapsed[0]).toEqual(ev('a', 'attested', 2))
    expect(collapsed[1]).toEqual(ev('b', 'pending', 1))
  })
})

describe('isValidTransition — status DAG (#35)', () => {
  it('allows the defined edges and same-status re-asserts', () => {
    expect(isValidTransition('pending', 'attested')).toBe(true)
    expect(isValidTransition('attested', 'slashed')).toBe(true)
    expect(isValidTransition('slashed', 'attested')).toBe(true)
    expect(isValidTransition('attested', 'attested')).toBe(true)
  })

  it('rejects backward / illegal edges', () => {
    expect(isValidTransition('attested', 'pending')).toBe(false)
    expect(isValidTransition('pending', 'slashed')).toBe(false)
    expect(isValidTransition('slashed', 'pending')).toBe(false)
  })
})
