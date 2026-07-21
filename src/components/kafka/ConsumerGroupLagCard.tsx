'use client';

// ConsumerGroupLagCard — per-group lag breakdown card.
// Issue #109 — Kafka Consumer Lag Monitoring.

import { useState } from 'react';
import { LagStatusBadge } from './LagStatusBadge';
import type { ConsumerGroupLag, ScalingStatus } from '../../types/kafka';

interface ConsumerGroupLagCardProps {
  group: ConsumerGroupLag;
  scalingStatus?: ScalingStatus;
  onManualScale?: (groupId: string, targetInstances: number) => void;
}

function formatLag(lag: number): string {
  if (lag >= 1_000_000) return `${(lag / 1_000_000).toFixed(2)}M`;
  if (lag >= 1_000) return `${(lag / 1_000).toFixed(1)}K`;
  return String(lag);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ConsumerGroupLagCard({
  group,
  scalingStatus,
  onManualScale,
}: ConsumerGroupLagCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [scaleInput, setScaleInput] = useState('');

  const { groupId, topic, partitions, totalLag, maxPartitionLag, capturedAt, status } = group;
  const config = scalingStatus?.config;

  function handleManualScale() {
    const target = parseInt(scaleInput, 10);
    if (!isNaN(target) && target > 0 && onManualScale) {
      onManualScale(groupId, target);
      setScaleInput('');
    }
  }

  return (
    <article
      className="rounded-2xl border border-white/10 bg-slate-900/80 p-5"
      aria-label={`Consumer group ${groupId}`}
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Consumer Group
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-white">{groupId}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Topic: {topic}</p>
        </div>
        <LagStatusBadge status={status} />
      </div>

      {/* Summary stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCell label="Total Lag" value={formatLag(totalLag)} highlight={status !== 'healthy'} />
        <StatCell label="Max Partition Lag" value={formatLag(maxPartitionLag)} />
        <StatCell label="Partitions" value={String(partitions.length)} />
        {config && (
          <StatCell
            label="Instances"
            value={`${config.currentInstances} / ${config.maxInstances}`}
          />
        )}
      </div>

      {/* Partition table toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mb-3 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded"
        aria-expanded={expanded}
        aria-controls={`partition-table-${groupId}`}
      >
        {expanded ? 'Hide' : 'Show'} partition breakdown ({partitions.length})
      </button>

      {/* Partition breakdown */}
      {expanded && (
        <div id={`partition-table-${groupId}`} className="mb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="pb-2 pr-4 font-medium">Partition</th>
                <th className="pb-2 pr-4 font-medium">Log-End Offset</th>
                <th className="pb-2 pr-4 font-medium">Consumer Offset</th>
                <th className="pb-2 pr-4 font-medium">Lag</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {partitions.map((p) => (
                <tr
                  key={p.partition}
                  className="border-b border-white/5 text-slate-300 last:border-0"
                >
                  <td className="py-1.5 pr-4 tabular-nums">{p.partition}</td>
                  <td className="py-1.5 pr-4 tabular-nums font-mono">
                    {p.logEndOffset.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-4 tabular-nums font-mono">
                    {p.consumerOffset.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-4 tabular-nums font-semibold">
                    {formatLag(p.lag)}
                  </td>
                  <td className="py-1.5">
                    <LagStatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual scaling */}
      {scalingStatus?.enabled && onManualScale && config && (
        <div className="mb-3 flex items-center gap-2">
          <label
            htmlFor={`scale-input-${groupId}`}
            className="text-xs text-slate-400 shrink-0"
          >
            Manual scale to:
          </label>
          <input
            id={`scale-input-${groupId}`}
            type="number"
            min={config.minInstances}
            max={config.maxInstances}
            value={scaleInput}
            onChange={(e) => setScaleInput(e.target.value)}
            placeholder={String(config.currentInstances)}
            className="w-20 rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label={`Target instance count for ${groupId}`}
          />
          <button
            type="button"
            onClick={handleManualScale}
            disabled={!scaleInput}
            className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Apply
          </button>
          <span className="text-xs text-slate-500">
            range {config.minInstances}–{config.maxInstances}
          </span>
        </div>
      )}

      {/* Last event */}
      {scalingStatus?.lastEvent && (
        <p className="text-xs text-slate-500">
          Last scaling:{' '}
          <span className="text-slate-300">
            {scalingStatus.lastEvent.previousInstances} → {scalingStatus.lastEvent.targetInstances} instances
          </span>{' '}
          at {formatTime(scalingStatus.lastEvent.triggeredAt)}
        </p>
      )}

      <p className="mt-2 text-xs text-slate-600">Snapshot at {formatTime(capturedAt)}</p>
    </article>
  );
}

function StatCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${highlight ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
