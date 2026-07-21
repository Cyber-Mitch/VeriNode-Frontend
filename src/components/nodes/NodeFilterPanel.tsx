'use client';

import { useCallback } from 'react';
import { useNodeStore, type FilterState } from '@/src/store/nodeStore';
import { useFilter } from '@/src/hooks/useNodeList';

const STATUS_OPTIONS: Array<{ value: FilterState['status']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'slashed', label: 'Slashed' },
  { value: 'pending', label: 'Pending' },
];

interface NodeFilterPanelProps {
  reputationMin?: number;
  reputationMax?: number;
}

/**
 * NodeFilterPanel — provides filter controls for the node list.
 *
 * Tracks user interaction (mouseDown / mouseUp) to signal the store that
 * WebSocket updates should be queued rather than applied immediately.
 * This prevents the race condition described in issue #40 where a WebSocket
 * update and a user filter adjustment produced a stale filtered list.
 */
export function NodeFilterPanel({
  reputationMin = 0,
  reputationMax = 1000,
}: NodeFilterPanelProps) {
  const filter = useFilter();
  const setFilter = useNodeStore((s) => s.setFilter);
  const setUserInteracting = useNodeStore((s) => s.setUserInteracting);

  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setFilter({ status: e.target.value as FilterState['status'] });
    },
    [setFilter],
  );

  const handleReputationMin = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilter({ reputationRange: [Number(e.target.value), filter.reputationRange[1]] });
    },
    [setFilter, filter.reputationRange],
  );

  const handleReputationMax = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilter({ reputationRange: [filter.reputationRange[0], Number(e.target.value)] });
    },
    [setFilter, filter.reputationRange],
  );

  const handleBondToggle = useCallback(() => {
    setFilter({
      bondStatus: filter.bondStatus === null ? true : filter.bondStatus === true ? false : null,
    });
  }, [setFilter, filter.bondStatus]);

  // Interaction lock — signals store that user is actively using filter controls
  const handleInteractionStart = useCallback(() => {
    setUserInteracting(true);
  }, [setUserInteracting]);

  const handleInteractionEnd = useCallback(() => {
    setUserInteracting(false);
  }, [setUserInteracting]);

  const bondLabel =
    filter.bondStatus === null
      ? 'Any Bond'
      : filter.bondStatus
        ? 'Bonded'
        : 'Unbonded';

  return (
    <div
      className="flex flex-wrap gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      onMouseDown={handleInteractionStart}
      onMouseUp={handleInteractionEnd}
      onBlur={handleInteractionEnd}
    >
      {/* Status Filter */}
      <div className="flex flex-col gap-1">
        <label htmlFor="status-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Status
        </label>
        <select
          id="status-filter"
          value={filter.status}
          onChange={handleStatusChange}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Reputation Range */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Reputation: [{filter.reputationRange[0]} – {filter.reputationRange[1]}]
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={reputationMin}
            max={reputationMax}
            value={filter.reputationRange[0]}
            onChange={handleReputationMin}
            onMouseDown={handleInteractionStart}
            onMouseUp={handleInteractionEnd}
            className="w-24 accent-blue-500"
            aria-label="Minimum reputation"
          />
          <input
            type="range"
            min={reputationMin}
            max={reputationMax}
            value={filter.reputationRange[1]}
            onChange={handleReputationMax}
            onMouseDown={handleInteractionStart}
            onMouseUp={handleInteractionEnd}
            className="w-24 accent-blue-500"
            aria-label="Maximum reputation"
          />
        </div>
      </div>

      {/* Bond Status */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Bond
        </label>
        <button
          type="button"
          onClick={handleBondToggle}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {bondLabel}
        </button>
      </div>
    </div>
  );
}
