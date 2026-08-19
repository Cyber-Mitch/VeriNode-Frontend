'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HealthScore, LiveOperatorMetrics } from '@/src/types/operator';
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

export interface UseOperatorMetricsOptions {
  /** WebSocket URL for live metrics. Defaults to NEXT_PUBLIC_OPERATOR_METRICS_WS. */
  url?: string;
  enabled?: boolean;
  /** Healthy peer-count target for the health score. */
  peerTarget?: number;
}

export interface UseOperatorMetricsResult {
  metrics: LiveOperatorMetrics | null;
  health: HealthScore | null;
  isConnected: boolean;
  error: string | null;
}

/**
 * Live validator performance metrics over WebSocket, with the composite health
 * score derived on each update. Auto-reconnects (5s) like the other stream
 * hooks in this repo. Historical series for the charts are composed separately
 * (see useOperatorHistory); this hook owns the real-time leg.
 */
export function useOperatorMetrics(
  options: UseOperatorMetricsOptions = {},
): UseOperatorMetricsResult {
  const {
    url = process.env.NEXT_PUBLIC_OPERATOR_METRICS_WS ?? '',
    enabled = true,
    peerTarget,
  } = options;

  const [metrics, setMetrics] = useState<LiveOperatorMetrics | null>(null);
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
          if (data.type === 'operator-metrics') {
            setMetrics(parseWireMetrics(data));
          }
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
  }, [url, enabled]);

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

  return { metrics, health, isConnected, error };
}
