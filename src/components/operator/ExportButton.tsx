'use client';

import { useCallback, useState } from 'react';
import type { OperatorHistory, TimeRange } from '@/src/types/operator';
import { buildMetricsCsv, exportFilename } from '@/src/lib/operatorExport';

export interface ExportButtonProps {
  history: OperatorHistory;
  timeRange: TimeRange;
  disabled?: boolean;
}

/** Downloads a CSV of performance metrics for the currently-selected range. */
export function ExportButton({ history, timeRange, disabled }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleExport = useCallback(() => {
    setBusy(true);
    try {
      const csv = buildMetricsCsv(history, timeRange);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }, [history, timeRange]);

  const noData =
    history.balances.length === 0 && history.attestationEffectiveness.length === 0;

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || busy || noData}
      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      aria-label="Export performance metrics as CSV"
      title={noData ? 'No data to export in the selected range' : 'Export CSV'}
    >
      {busy ? 'Exporting…' : 'Export CSV'}
    </button>
  );
}
