'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import type {
  ReputationDataPoint,
  DecimationConfig,
  ChartPerformanceMetrics,
} from '@/src/types/reputation';
import { useReputationStream } from '@/src/hooks/useReputationStream';
import { reputationChartConfig, createReputationDataset } from './chartConfig';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface ReputationChartProps {
  /** Node ID to track */
  nodeId: string;
  /** Enable simulated events for testing */
  simulateEvents?: boolean;
  /** Batch update interval in ms (default: 100ms) */
  batchInterval?: number;
  /** Enable decimation for high event rates */
  enableDecimation?: boolean;
  /** Use requestAnimationFrame for rendering */
  useRAF?: boolean;
}

/**
 * ReputationChart component with batched updates for performance optimization
 * 
 * Performance optimizations:
 * 1. Batched updates: buffers data points and updates chart once per interval
 * 2. requestAnimationFrame-based rendering: ensures max 60 updates/sec
 * 3. Decimation: aggregates points at high event rates
 * 4. Performance metrics tracking
 */
export function ReputationChart({
  nodeId,
  simulateEvents = false,
  batchInterval = 100,
  enableDecimation = true,
  useRAF = true,
}: ReputationChartProps) {
  const chartRef = useRef<ChartJS<'line'> | null>(null);
  const bufferRef = useRef<ReputationDataPoint[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDirtyRef = useRef(false);
  const lastUpdateTimeRef = useRef<number>(0);
  const rafLoopRef = useRef<(() => void) | null>(null);
  
  const [eventRate, setEventRate] = useState<number>(0);
  const [bufferSize, setBufferSize] = useState<number>(0);
  
  // Initialize lastUpdateTimeRef on mount
  useEffect(() => {
    lastUpdateTimeRef.current = Date.now();
  }, []);
  
  const [chartData, setChartData] = useState({
    datasets: [createReputationDataset('Reputation Score', [])],
  });
  
  const [metrics, setMetrics] = useState<ChartPerformanceMetrics>({
    updateCount: 0,
    totalUpdateTime: 0,
    maxFrameFreeze: 0,
    droppedFrames: 0,
    averageUpdateTime: 0,
  });
  
  const [decimation, setDecimation] = useState<DecimationConfig>({
    threshold: 10, // events per second
    granularityMs: 1000,
    active: false,
  });

  /**
   * Process buffered data points and update chart
   * Uses batching to reduce chart update calls
   */
  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length === 0) return;

    const startTime = performance.now();
    const currentData = chartRef.current?.data.datasets[0].data as { x: number; y: number }[] || [];
    
    // Calculate event rate
    const now = Date.now();
    const timeDelta = (now - lastUpdateTimeRef.current) / 1000; // seconds
    const currentEventRate = bufferRef.current.length / Math.max(timeDelta, 0.001);
    setEventRate(currentEventRate);
    lastUpdateTimeRef.current = now;
    
    // Update buffer size for display
    setBufferSize(bufferRef.current.length);
    
    // Check if decimation should be activated
    const shouldDecimate = enableDecimation && currentEventRate > decimation.threshold;
    
    let newPoints: { x: number; y: number }[];
    
    if (shouldDecimate) {
      // Aggregate points: group by time window and compute average score
      const aggregated = new Map<number, { sum: number; count: number }>();
      
      for (const point of bufferRef.current) {
        const bucket = Math.floor(point.timestamp / decimation.granularityMs) * decimation.granularityMs;
        const existing = aggregated.get(bucket) || { sum: 0, count: 0 };
        aggregated.set(bucket, {
          sum: existing.sum + point.score,
          count: existing.count + 1,
        });
      }
      
      newPoints = Array.from(aggregated.entries()).map(([timestamp, { sum, count }]) => ({
        x: timestamp,
        y: sum / count, // Average score
      }));
      
      if (!decimation.active) {
        setDecimation(prev => ({ ...prev, active: true }));
      }
    } else {
      // No decimation: use all points
      newPoints = bufferRef.current.map(point => ({
        x: point.timestamp,
        y: point.score,
      }));
      
      if (decimation.active) {
        setDecimation(prev => ({ ...prev, active: false }));
      }
    }
    
    // Update chart data using spread operator for single push
    const updatedData = [...currentData, ...newPoints];
    
    setChartData({
      datasets: [createReputationDataset('Reputation Score', updatedData)],
    });
    
    // Update chart with no animation
    if (chartRef.current) {
      chartRef.current.update('none');
    }
    
    // Clear buffer and update display
    bufferRef.current = [];
    setBufferSize(0);
    
    // Track performance metrics
    const endTime = performance.now();
    const updateDuration = endTime - startTime;
    
    setMetrics(prev => {
      const newUpdateCount = prev.updateCount + 1;
      const newTotalTime = prev.totalUpdateTime + updateDuration;
      const newMaxFreeze = Math.max(prev.maxFrameFreeze, updateDuration);
      const newDroppedFrames = prev.droppedFrames + (updateDuration > 16 ? 1 : 0);
      
      return {
        updateCount: newUpdateCount,
        totalUpdateTime: newTotalTime,
        maxFrameFreeze: newMaxFreeze,
        droppedFrames: newDroppedFrames,
        averageUpdateTime: newTotalTime / newUpdateCount,
      };
    });
    
    isDirtyRef.current = false;
  }, [enableDecimation, decimation.threshold, decimation.granularityMs, decimation.active]);

  /**
   * requestAnimationFrame loop for rendering
   * Ensures chart updates happen at most once per frame (max 60fps)
   */
  useEffect(() => {
    rafLoopRef.current = () => {
      if (isDirtyRef.current) {
        flushBuffer();
      }
      rafRef.current = requestAnimationFrame(rafLoopRef.current!);
    };
  }, [flushBuffer]);

  /**
   * Handle incoming data point from WebSocket
   * Adds to buffer instead of immediately updating chart
   */
  const handleDataPoint = useCallback((point: ReputationDataPoint) => {
    bufferRef.current.push(point);
    isDirtyRef.current = true;
  }, []);

  // Initialize reputation stream
  useReputationStream({
    nodeId,
    simulateEvents,
    onDataPoint: handleDataPoint,
  });

  // Setup batched update interval or RAF loop
  useEffect(() => {
    if (useRAF) {
      // Use requestAnimationFrame for rendering
      if (rafLoopRef.current) {
        rafRef.current = requestAnimationFrame(rafLoopRef.current);
      }
      
      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }
      };
    } else {
      // Use fixed interval for batched updates
      intervalRef.current = setInterval(flushBuffer, batchInterval);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        // Flush remaining data on unmount
        flushBuffer();
      };
    }
  }, [useRAF, batchInterval, flushBuffer]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-white">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Reputation Trend</h2>
          <p className="text-sm text-slate-400">
            Node {nodeId} · Real-time reputation tracking
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
            {chartData.datasets[0].data.length} points
          </span>
          {decimation.active && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
              Decimation Active
            </span>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full rounded-xl bg-slate-950/60 p-4">
        <Line
          ref={chartRef}
          data={chartData}
          options={reputationChartConfig}
        />
      </div>

      {/* Performance Metrics */}
      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <Metric
          label="Updates"
          value={metrics.updateCount.toString()}
          tone="text-blue-400"
        />
        <Metric
          label="Avg Update"
          value={`${metrics.averageUpdateTime.toFixed(2)}ms`}
          tone={metrics.averageUpdateTime > 5 ? 'text-amber-400' : 'text-emerald-400'}
        />
        <Metric
          label="Max Freeze"
          value={`${metrics.maxFrameFreeze.toFixed(2)}ms`}
          tone={metrics.maxFrameFreeze > 16 ? 'text-red-400' : 'text-emerald-400'}
        />
      </div>

      {/* Additional Metrics Row */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <Metric
          label="Dropped Frames"
          value={metrics.droppedFrames.toString()}
          tone={metrics.droppedFrames > 0 ? 'text-red-400' : 'text-emerald-400'}
        />
        <Metric
          label="Event Rate"
          value={`${eventRate.toFixed(1)}/s`}
          tone="text-slate-400"
        />
        <Metric
          label="Buffer Size"
          value={bufferSize.toString()}
          tone="text-slate-400"
        />
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
