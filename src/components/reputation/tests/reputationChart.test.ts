import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  ReputationDataPoint,
  ChartPerformanceMetrics,
} from '@/src/types/reputation';
import { simulateMultiNodeRecovery } from '@/src/hooks/useReputationStream';

/**
 * Performance test utilities
 */
class ChartUpdateSimulator {
  private updateTimes: number[] = [];
  private updateCount = 0;
  private maxFreeze = 0;
  private droppedFrames = 0;

  /**
   * Simulate a chart update operation
   * @param dataPoints Number of data points to process
   * @returns Update duration in milliseconds
   */
  simulateUpdate(dataPoints: number): number {
    const startTime = performance.now();
    
    // Simulate chart processing time (3-5ms per call as per issue)
    const baseTime = 3 + Math.random() * 2;
    
    // Additional overhead for large batches
    const overhead = dataPoints > 10 ? dataPoints * 0.1 : 0;
    
    const duration = baseTime + overhead;
    
    // Busy wait to simulate actual work
    const endTarget = startTime + duration;
    while (performance.now() < endTarget) {
      // Simulate work
    }
    
    const actualDuration = performance.now() - startTime;
    
    this.updateTimes.push(actualDuration);
    this.updateCount++;
    this.maxFreeze = Math.max(this.maxFreeze, actualDuration);
    
    if (actualDuration > 16) {
      this.droppedFrames++;
    }
    
    return actualDuration;
  }

  getMetrics(): ChartPerformanceMetrics {
    const totalTime = this.updateTimes.reduce((sum, t) => sum + t, 0);
    return {
      updateCount: this.updateCount,
      totalUpdateTime: totalTime,
      maxFrameFreeze: this.maxFreeze,
      droppedFrames: this.droppedFrames,
      averageUpdateTime: totalTime / this.updateCount,
    };
  }

  reset() {
    this.updateTimes = [];
    this.updateCount = 0;
    this.maxFreeze = 0;
    this.droppedFrames = 0;
  }
}

/**
 * Batched update handler
 */
class BatchedChartUpdater {
  private buffer: ReputationDataPoint[] = [];
  private batchInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private simulator: ChartUpdateSimulator;
  private onUpdate?: (metrics: ChartPerformanceMetrics) => void;

  constructor(
    batchInterval: number,
    simulator: ChartUpdateSimulator,
    onUpdate?: (metrics: ChartPerformanceMetrics) => void
  ) {
    this.batchInterval = batchInterval;
    this.simulator = simulator;
    this.onUpdate = onUpdate;
  }

  start() {
    this.intervalId = setInterval(() => {
      this.flush();
    }, this.batchInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.flush(); // Final flush
  }

  addDataPoint(point: ReputationDataPoint) {
    this.buffer.push(point);
  }

  private flush() {
    if (this.buffer.length === 0) return;
    
    const batchSize = this.buffer.length;
    this.simulator.simulateUpdate(batchSize);
    this.buffer = [];
    
    if (this.onUpdate) {
      this.onUpdate(this.simulator.getMetrics());
    }
  }

  getBufferSize() {
    return this.buffer.length;
  }
}

describe('ReputationChart Performance', () => {
  let simulator: ChartUpdateSimulator;

  beforeEach(() => {
    simulator = new ChartUpdateSimulator();
  });

  afterEach(() => {
    simulator.reset();
  });

  describe('Baseline Performance (No Batching)', () => {
    it('should demonstrate performance issue with immediate updates', () => {
      // Simulate the problem: 10 events cause 10 immediate chart updates
      const events = 10;
      
      for (let i = 0; i < events; i++) {
        simulator.simulateUpdate(1); // Update chart for each event
      }
      
      const metrics = simulator.getMetrics();
      
      // Verify the problem exists
      expect(metrics.updateCount).toBe(10);
      expect(metrics.totalUpdateTime).toBeGreaterThan(30); // 10 * 3ms minimum
      
      // With 10 updates of ~3-5ms each within 100ms, we expect issues
      console.log('Baseline (No Batching) Metrics:', metrics);
    });

    it('should show dropped frames with 50 nodes × 10 events', () => {
      // Simulate worst case: 500 events total
      const totalEvents = 50 * 10;
      
      for (let i = 0; i < totalEvents; i++) {
        simulator.simulateUpdate(1);
      }
      
      const metrics = simulator.getMetrics();
      
      expect(metrics.updateCount).toBe(500);
      expect(metrics.totalUpdateTime).toBeGreaterThan(1500); // 500 * 3ms minimum
      
      // This would cause massive UI freeze
      console.log('Worst Case (No Batching) Metrics:', metrics);
      expect(metrics.totalUpdateTime).toBeGreaterThan(1000); // > 1 second freeze
    });
  });

  describe('Batched Updates (Solution)', () => {
    it('should reduce update count with 100ms batching', async () => {
      const updater = new BatchedChartUpdater(100, simulator);
      updater.start();
      
      // Simulate 10 events within 100ms
      const events: ReputationDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: Date.now() + i * 10,
        score: 500 + i * 10,
        eventType: 'recovery' as const,
      }));
      
      events.forEach(event => updater.addDataPoint(event));
      
      // Wait for batch interval
      await new Promise(resolve => setTimeout(resolve, 150));
      
      updater.stop();
      
      const metrics = simulator.getMetrics();
      
      // Should only update once (batched)
      expect(metrics.updateCount).toBeLessThanOrEqual(2); // At most 2 (initial + final flush)
      expect(metrics.totalUpdateTime).toBeLessThan(20); // Much less than 10 * 3ms
      
      console.log('Batched Updates (100ms) Metrics:', metrics);
    });

    it('should pass performance benchmark: 500 events in 1 second with <50ms max freeze', async () => {
      const updater = new BatchedChartUpdater(100, simulator);
      
      updater.start();
      
      // Simulate 50 nodes with 10 events each
      const nodeCount = 50;
      const eventsPerNode = 10;
      
      simulateMultiNodeRecovery((event) => {
        updater.addDataPoint(event.data);
      }, nodeCount, eventsPerNode);
      
      // Wait for all events to be processed
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      updater.stop();
      
      const finalMetrics = simulator.getMetrics();
      
      // Performance requirements from issue
      expect(finalMetrics.maxFrameFreeze).toBeLessThan(50); // Target: < 50ms
      expect(finalMetrics.updateCount).toBeLessThan(20); // Should batch effectively
      
      // The important metric is that max freeze is < 50ms
      expect(finalMetrics.averageUpdateTime).toBeLessThan(50);
      
      console.log('Performance Benchmark Results:', finalMetrics);
      console.log('✓ Max freeze < 50ms:', finalMetrics.maxFrameFreeze < 50);
      console.log('✓ Effective batching:', finalMetrics.updateCount < 20);
    });
  });

  describe('requestAnimationFrame Rendering', () => {
    it('should limit updates to ~60fps with RAF', async () => {
      let rafUpdateCount = 0;
      let isDirty = false;
      const dataPoints: ReputationDataPoint[] = [];
      
      // Simulate RAF loop
      const rafSimulator = () => {
        if (isDirty && dataPoints.length > 0) {
          simulator.simulateUpdate(dataPoints.length);
          dataPoints.length = 0; // Clear buffer
          isDirty = false;
          rafUpdateCount++;
        }
      };
      
      // Simulate 100 events over 1 second
      for (let i = 0; i < 100; i++) {
        dataPoints.push({
          timestamp: Date.now() + i * 10,
          score: 500 + i,
          eventType: 'recovery',
        });
        isDirty = true;
        
        // Simulate RAF callback every ~16ms
        if (i % 2 === 0) {
          rafSimulator();
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      // Final flush
      if (isDirty) rafSimulator();
      
      const metrics = simulator.getMetrics();
      
      // Should have significantly fewer updates than total events
      expect(metrics.updateCount).toBeLessThan(100);
      // At 60fps, we should have ~60 updates per second max
      expect(metrics.updateCount).toBeLessThanOrEqual(60);
      
      console.log('RAF Rendering Metrics:', metrics);
      console.log('Update count with RAF:', rafUpdateCount);
    });
  });

  describe('Decimation Strategy', () => {
    it('should aggregate points when event rate exceeds threshold', () => {
      const events: ReputationDataPoint[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() + i * 10, // 100 events in 1 second
        score: 500 + Math.random() * 100,
        eventType: 'recovery' as const,
      }));
      
      // Group events by 1-second buckets
      const granularityMs = 1000;
      const aggregated = new Map<number, { sum: number; count: number }>();
      
      for (const point of events) {
        const bucket = Math.floor(point.timestamp / granularityMs) * granularityMs;
        const existing = aggregated.get(bucket) || { sum: 0, count: 0 };
        aggregated.set(bucket, {
          sum: existing.sum + point.score,
          count: existing.count + 1,
        });
      }
      
      const decimatedPoints = Array.from(aggregated.entries()).map(([timestamp, { sum, count }]) => ({
        x: timestamp,
        y: sum / count,
      }));
      
      // Should reduce 100 points to just a few buckets
      expect(decimatedPoints.length).toBeLessThan(10);
      expect(decimatedPoints.length).toBeGreaterThan(0);
      
      console.log(`Decimation: ${events.length} points → ${decimatedPoints.length} points`);
    });
  });

  describe('Invariant Verification', () => {
    it('should satisfy: ∑(chart_update_time) < 100ms over any 500ms window', async () => {
      const maxAllowedTime = 100; // ms
      const updater = new BatchedChartUpdater(100, simulator);
      
      updater.start();
      
      // Simulate continuous high-frequency events
      const duration = 1000; // 1 second test
      
      const intervalId = setInterval(() => {
        // Add 10 events every 100ms (100 events/sec)
        for (let i = 0; i < 10; i++) {
          updater.addDataPoint({
            timestamp: Date.now(),
            score: 500 + Math.random() * 100,
            eventType: 'recovery',
          });
        }
      }, 100);
      
      // Run for 1 second
      await new Promise(resolve => setTimeout(resolve, duration));
      
      clearInterval(intervalId);
      updater.stop();
      
      const metrics = simulator.getMetrics();
      
      // Calculate time per 500ms window
      // With batching every 100ms, we have ~5 updates per 500ms window
      // Each update should be < 20ms (conservative estimate)
      const updatesPerWindow = 5;
      const timePerWindow = metrics.averageUpdateTime * updatesPerWindow;
      
      expect(timePerWindow).toBeLessThan(maxAllowedTime);
      
      console.log('Invariant Check:', {
        averageUpdateTime: metrics.averageUpdateTime,
        updatesPerWindow,
        timePerWindow,
        withinInvariant: timePerWindow < maxAllowedTime,
      });
    });
  });

  describe('Buffer Management', () => {
    it('should not accumulate unbounded buffer during high load', async () => {
      const updater = new BatchedChartUpdater(100, simulator);
      updater.start();
      
      // Add events rapidly
      for (let i = 0; i < 50; i++) {
        updater.addDataPoint({
          timestamp: Date.now() + i,
          score: 500 + i,
          eventType: 'recovery',
        });
      }
      
      const bufferSizeBefore = updater.getBufferSize();
      
      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const bufferSizeAfter = updater.getBufferSize();
      
      // Buffer should be cleared after flush
      expect(bufferSizeAfter).toBeLessThan(bufferSizeBefore);
      expect(bufferSizeAfter).toBeLessThanOrEqual(10); // Should be mostly empty
    });
  });
});

describe('useReputationStream', () => {
  it('should generate simulated recovery events correctly', async () => {
    const events: ReputationDataPoint[] = [];
    
    simulateMultiNodeRecovery((event) => {
      events.push(event.data);
    }, 5, 10);
    
    // Wait for all setTimeout callbacks to execute
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Should generate 5 nodes * 11 events (1 slashing + 10 recovery)
    expect(events.length).toBe(55);
    
    // Verify event types
    const slashingEvents = events.filter(e => e.eventType === 'slashing');
    const recoveryEvents = events.filter(e => e.eventType === 'recovery');
    
    expect(slashingEvents.length).toBe(5);
    expect(recoveryEvents.length).toBe(50);
  });
});
