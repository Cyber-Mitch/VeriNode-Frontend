'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReputationEvent, ReputationDataPoint } from '@/src/types/reputation';

interface UseReputationStreamOptions {
  /** Node ID to track */
  nodeId: string;
  /** Enable simulated WebSocket events for testing */
  simulateEvents?: boolean;
  /** Callback when new data point arrives */
  onDataPoint?: (point: ReputationDataPoint) => void;
}

/**
 * Hook to stream reputation data from WebSocket (or simulated events)
 * Simulates high-frequency reputation events for testing performance
 */
export function useReputationStream({
  nodeId,
  simulateEvents = false,
  onDataPoint,
}: UseReputationStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventCountRef = useRef(0);

  useEffect(() => {
    if (!simulateEvents) {
      // In production, connect to real WebSocket
      // For now, just mark as connected
      setConnected(true);
      return;
    }

    // Simulate WebSocket connection
    setConnected(true);
    setError(null);

    // Simulate high-frequency events (recovery scenario)
    // This mimics the issue: 1 slashing followed by 10 rewards within 100ms
    const simulateRecoveryBurst = () => {
      const now = Date.now();
      
      // Initial slashing event
      const slashingEvent: ReputationDataPoint = {
        timestamp: now,
        score: 500, // -500 from previous value
        eventType: 'slashing',
      };
      onDataPoint?.(slashingEvent);
      eventCountRef.current++;

      // Followed by 10 rapid recovery rewards (10ms apart)
      for (let i = 1; i <= 10; i++) {
        setTimeout(() => {
          const rewardEvent: ReputationDataPoint = {
            timestamp: now + i * 10,
            score: 500 + i * 10, // +10 per reward
            eventType: 'recovery',
          };
          onDataPoint?.(rewardEvent);
          eventCountRef.current++;
        }, i * 10);
      }
    };

    // Start simulation: burst every 2 seconds
    intervalRef.current = setInterval(simulateRecoveryBurst, 2000);

    // Initial burst
    simulateRecoveryBurst();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setConnected(false);
    };
  }, [nodeId, simulateEvents, onDataPoint]);

  return {
    connected,
    error,
    eventCount: eventCountRef.current,
  };
}

/**
 * Simulate multi-node recovery scenario (50 nodes)
 * This is used for performance testing
 */
export function simulateMultiNodeRecovery(
  onEvent: (event: ReputationEvent) => void,
  nodeCount: number = 50,
  eventsPerNode: number = 10
) {
  const baseTime = Date.now();
  
  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const nodeId = `node-${nodeIndex}`;
    
    // Each node has a slashing followed by recovery rewards
    // All nodes fire within 100ms window
    const nodeOffset = Math.random() * 100; // Stagger within 100ms
    
    // Slashing event
    setTimeout(() => {
      onEvent({
        nodeId,
        data: {
          timestamp: baseTime + nodeOffset,
          score: 500,
          eventType: 'slashing',
        },
      });
    }, nodeOffset);
    
    // Recovery rewards (10 events, 10ms apart)
    for (let i = 1; i <= eventsPerNode; i++) {
      setTimeout(() => {
        onEvent({
          nodeId,
          data: {
            timestamp: baseTime + nodeOffset + i * 10,
            score: 500 + i * 10,
            eventType: 'recovery',
          },
        });
      }, nodeOffset + i * 10);
    }
  }
}
