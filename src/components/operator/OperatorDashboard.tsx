'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { TimeRange } from '@/src/types/operator';
import { useOperatorMetrics } from '@/src/hooks/useOperatorMetrics';
import { OperatorOverview } from '@/src/components/operator/OperatorOverview';
import { TimeRangeSelector } from '@/src/components/operator/TimeRangeSelector';
import { AlertConfigPanel } from '@/src/components/operator/AlertConfigPanel';
import { ExportButton } from '@/src/components/operator/ExportButton';

// Lightweight Charts needs the DOM; load the charts client-only.
const PerformanceCharts = dynamic(
  () => import('@/src/components/operator/PerformanceCharts').then((m) => m.PerformanceCharts),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] animate-pulse rounded-xl border bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" />
    ),
  },
);

export interface OperatorDashboardProps {
  /** Live metrics WebSocket URL (defaults to NEXT_PUBLIC_OPERATOR_METRICS_WS). */
  metricsUrl?: string;
}

/**
 * Node Operator Dashboard: live validator performance metrics, health scoring,
 * historical charts, alert configuration, and CSV export.
 */
export function OperatorDashboard({ metricsUrl }: OperatorDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>({ kind: 'preset', preset: '7d' });

  const { metrics, health, history, isConnected } = useOperatorMetrics({ url: metricsUrl });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Operator Dashboard</h1>
          <p className="text-sm text-zinc-500">Real-time validator performance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <ExportButton history={history} timeRange={timeRange} />
        </div>
      </header>

      <OperatorOverview metrics={metrics} health={health} isConnected={isConnected} />

      <PerformanceCharts history={history} timeRange={timeRange} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AlertConfigPanel />
      </div>
    </div>
  );
}
