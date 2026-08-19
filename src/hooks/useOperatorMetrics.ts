'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AttestationEffectivenessPoint,
  BalanceHistoryPoint,
  HealthScore,
  LiveOperatorMetrics,
  OperatorHistory,
  ProposalPoint,
} from '@/src/types/operator';
import { computeHealthScore } from '@/src/lib/operatorHealth';

/**
 * Wire-format of a live metrics message. Numeric fields arrive as JSON numbers;
 * the validator balance arrives as a string because JSON has no bigint.
 */
interface OperatorMetricsWireEvent {
  type: 'operator-metrics';
  metrics: Omit<LiveOperatorMetrics, 'validatorBalanceGwei' | 'updatedAt'> & {
    validatorBalanceGwei: string;
    updatedAt?: number;
  };
}

function parseWireMetrics(evt: OperatorMetricsWireEvent): LiveOperatorMetrics {
  const m = evt.metrics;
  return {
    currentEpoch: m.currentEpoch,
    currentSlot: m.currentSlot,
    finalizedBlock: m.finalizedBlock,
    validatorBalanceGwei: BigInt(m.validatorBalanceGwei),
    effectivenessPct: m.effectivenessPct,
    queuePosition: m.queuePosition ?? null,
    attestationEffectivenessPct: m.attestationEffectivenessPct,
    proposalTimelinessPct: m.proposalTimelinessPct,
    uptimePct: m.uptimePct,
    peerCount: m.peerCount,
    updatedAt: m.updatedAt ?? Date.now(),
  };
}

/** Insert/replace a point keyed by epoch, keeping ascending order and a cap. */
function upsertByEpoch<T extends { epoch: number }>(prev: T[], next: T, max: number): T[] {
  const idx = prev.findIndex((p) => p.epoch === next.epoch);
  let out: T[];
  if (idx >= 0) {
    out = prev.slice();
    out[idx] = next;
  } else {
    out = [...prev, next].sort((a, b) => a.epoch - b.epoch);
  }
  return out.length > max ? out.slice(out.length - max) : out;
}

export interface UseOperatorMetricsOptions {
  /** WebSocket URL for live metrics. Defaults to NEXT_PUBLIC_OPERATOR_METRICS_WS. */
  url?: string;
  enabled?: boolean;
  /** Healthy peer-count target for the health score. */
  peerTarget?: number;
  /** Max points retained per historical series. */
  maxHistory?: number;
  /** Seed proposals (e.g. from a REST backfill); the live stream carries none. */
  seedProposals?: ProposalPoint[];
}

export interface UseOperatorMetricsResult {
  metrics: LiveOperatorMetrics | null;
  health: HealthScore | null;
  history: OperatorHistory;
  isConnected: boolean;
  error: string | null;
}

/**
 * Live validator performance metrics over WebSocket, with the composite health
 * score derived on each update and a rolling historical buffer accumulated for
 * the charts. Auto-reconnects (5s) like the other stream hooks in this repo.
 *
 * History is accumulated inside the message handler (not a reactive effect) so
 * updates stay a single render per message.
 */
export function useOperatorMetrics(
  options: UseOperatorMetricsOptions = {},
): UseOperatorMetricsResult {
  const {
    url = process.env.NEXT_PUBLIC_OPERATOR_METRICS_WS ?? '',
    enabled = true,
    peerTarget,
    maxHistory = 5000,
    seedProposals,
  } = options;

  const [metrics, setMetrics] = useState<LiveOperatorMetrics | null>(null);
  const [balances, setBalances] = useState<BalanceHistoryPoint[]>([]);
  const [attestationEffectiveness, setAttestationEffectiveness] = useState<
    AttestationEffectivenessPoint[]
  >([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!enabled || !url) return;
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'WebSocket construction failed');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as OperatorMetricsWireEvent;
          if (data.type !== 'operator-metrics') return;
          const parsed = parseWireMetrics(data);
          setMetrics(parsed);
          // Accumulate history here (event callback), not in a reactive effect.
          setBalances((prev) =>
            upsertByEpoch(
              prev,
              { epoch: parsed.currentEpoch, balanceGwei: parsed.validatorBalanceGwei },
              maxHistory,
            ),
          );
          setAttestationEffectiveness((prev) =>
            upsertByEpoch(
              prev,
              { epoch: parsed.currentEpoch, effectivenessPct: parsed.attestationEffectivenessPct },
              maxHistory,
            ),
          );
        } catch (err) {
          console.error('[useOperatorMetrics] failed to parse message:', err);
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setError('WebSocket error');
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;
        setIsConnected(false);
        reconnectRef.current = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url, enabled, maxHistory]);

  const health = useMemo<HealthScore | null>(() => {
    if (!metrics) return null;
    return computeHealthScore({
      attestationEffectivenessPct: metrics.attestationEffectivenessPct,
      proposalTimelinessPct: metrics.proposalTimelinessPct,
      uptimePct: metrics.uptimePct,
      peerCount: metrics.peerCount,
      peerTarget,
    });
  }, [metrics, peerTarget]);

  const history = useMemo<OperatorHistory>(
    () => ({ balances, attestationEffectiveness, proposals: seedProposals ?? [] }),
    [balances, attestationEffectiveness, seedProposals],
  );

  return { metrics, health, history, isConnected, error };
}
