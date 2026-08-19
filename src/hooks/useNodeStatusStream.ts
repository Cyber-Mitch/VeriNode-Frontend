'use client';

import { useEffect, useRef } from 'react';
import { useNodeStore, type NodeInfo, type NodeStatus } from '@/src/store/nodeStore';
import { webSocketManager } from '@/src/services/webSocketManager';

interface WSStatusEvent {
  type: 'node-status-update';
  nodeId: string;
  status: NodeStatus;
}

interface WSInitEvent {
  type: 'node-list-init';
  nodes: NodeInfo[];
}

type WSEvent = WSStatusEvent | WSInitEvent;

interface UseNodeStatusStreamOptions {
  url: string;
  enabled?: boolean;
}

/**
 * WebSocket hook that feeds node status updates into the Zustand store.
 * When the user is interacting (isUserInteracting = true), updates are
 * queued rather than applied, preventing the race condition described in #40.
 */
export function useNodeStatusStream({ url, enabled = true }: UseNodeStatusStreamOptions) {
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!enabled || !url) return;

    mountedRef.current = true;

    const release = webSocketManager.acquireConnection({
      connectionId: `node-status:${url}`,
      url,
      enabled: true,
      onMessage: (data) => {
        if (!mountedRef.current) return;
        try {
          const parsed =
            typeof data === 'string' ? (JSON.parse(data) as unknown) : (data as unknown);
          const event = parsed as WSEvent
          const store = useNodeStore.getState();

          switch (event.type) {
            case 'node-list-init':
              store.setNodes(event.nodes);
              break;
            case 'node-status-update':
              store.updateNodeStatus(event.nodeId, event.status);
              break;
          }
        } catch (err) {
          // Ignore malformed frames; a single bad message shouldn't kill the feed.
          console.error('[NodeStatusStream] Failed to process message:', err);
        }
      },
      onError: (errMsg) => {
        // Keep it cheap; the tier-3 banner/health dashboard will surface persistent issues.
        console.error('[NodeStatusStream] WS error:', errMsg);
      },
    })

    return () => {
      mountedRef.current = false;
      release()
    };
  }, [url, enabled]);
}