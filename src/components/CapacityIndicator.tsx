'use client';

import { useState } from 'react';
import { useCapacityShedding } from '@/src/components/CapacitySheddingProvider';

function levelLabel(level: string): string {
  switch (level) {
    case 'healthy':
      return 'All Systems Normal';
    case 'degraded':
      return 'Degraded Performance';
    case 'critical':
      return 'Capacity Critical — Shedding Load';
    default:
      return 'Unknown';
  }
}

function levelIcon(level: string): string {
  switch (level) {
    case 'healthy':
      return '\u2713';
    case 'degraded':
      return '\u26A0';
    case 'critical':
      return '\u2716';
    default:
      return '?';
  }
}

function levelColor(level: string): string {
  switch (level) {
    case 'healthy':
      return 'border-green-400 bg-green-50 text-green-800';
    case 'degraded':
      return 'border-yellow-400 bg-yellow-50 text-yellow-800';
    case 'critical':
      return 'border-red-400 bg-red-50 text-red-800';
    default:
      return 'border-gray-400 bg-gray-50 text-gray-800';
  }
}

export function CapacityIndicator() {
  const { level } = useCapacityShedding();
  const [expanded, setExpanded] = useState(false);

  if (level === 'healthy') return null;

  return (
    <div className={`border-b px-4 py-2 text-sm ${levelColor(level)}`}>
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold">{levelIcon(level)}</span>
          <span className="font-medium">{levelLabel(level)}</span>
          {level === 'critical' && (
            <span className="ml-1 inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium underline hover:opacity-80"
        >
          {expanded ? 'Hide Details' : 'Details'}
        </button>
      </div>
      {expanded && (
        <div className="mx-auto mt-2 max-w-5xl text-xs">
          <p>
            Non-critical features may be temporarily unavailable. Critical operations
            (staking, governance) remain active.
          </p>
        </div>
      )}
    </div>
  );
}
