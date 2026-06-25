import React from 'react';
import { useGasStore } from '../../store/gasSlice';

export function CacheStatsPanel() {
  const stats = useGasStore((state) => state.stats);

  return (
    <div className="p-4 border rounded shadow-sm bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-2">Gas Cache Stats</h3>
      <ul>
        <li>Hit Rate: {(stats.hitRate * 100).toFixed(1)}%</li>
        <li>Size: {stats.size} entries</li>
        <li>Avg TTL: {stats.avgTtl.toFixed(1)}s</li>
      </ul>
    </div>
  );
}
