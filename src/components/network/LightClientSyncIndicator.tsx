'use client';

import React from 'react';
import { useLightClientSync } from '../../hooks/useLightClientSync';

export const LightClientSyncIndicator: React.FC = () => {
  const { metrics } = useLightClientSync();
  const { progress, phase, throughput, etaSeconds } = metrics;

  const radius = 60;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - progress * circumference;

  const getPhaseColor = () => {
    switch (phase) {
      case 'Bootstrap': return '#3b82f6'; // blue-500
      case 'Historical': return '#f97316'; // orange-500
      case 'Live Tail': return '#22c55e'; // green-500
      default: return '#3b82f6';
    }
  };

  const formatETA = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs} hours ${mins} minutes`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h3 className="text-lg font-semibold mb-6 text-zinc-800 dark:text-zinc-100">Light Client Sync</h3>
      
      <div className="relative flex items-center justify-center">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="transform -rotate-90"
        >
          {/* Background Ring */}
          <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="text-zinc-100 dark:text-zinc-800"
          />
          {/* Progress Ring */}
          <circle
            stroke={getPhaseColor()}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-in-out, stroke 0.5s ease-in-out' }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        
        {/* Center Text */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {(progress * 100).toFixed(1)}%
          </span>
          <span 
            className="text-xs font-medium uppercase tracking-wider mt-1"
            style={{ color: getPhaseColor(), transition: 'color 0.5s ease-in-out' }}
          >
            {phase}
          </span>
        </div>
      </div>

      <div className="mt-6 h-12 flex items-center justify-center text-center">
        {phase === 'Historical' && etaSeconds !== null ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Syncing at <span className="font-semibold">{Math.round(throughput)}</span> slots/sec
            <br />
            ETA: <span className="font-semibold">{formatETA(etaSeconds)}</span>
          </p>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
            {phase === 'Bootstrap' ? 'Fetching initial checkpoint...' : 'Validating live blocks'}
          </p>
        )}
      </div>
    </div>
  );
};
