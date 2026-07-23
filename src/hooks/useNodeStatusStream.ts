'use client';

import { useEffect, useRef } from 'react';
import { useNodeStore, type NodeInfo, type NodeStatus } from '@/src/store/nodeStore';

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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!enabled || !url) return;

    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[NodeStatusStream] WebSocket connected:', url);
      };

      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data);
          const store = useNodeStore.getState();

          switch (data.type) {
            case 'node-list-init':
              store.setNodes(data.nodes);
              break;
            case 'node-status-update':
              store.updateNodeStatus(data.nodeId, data.status);
              break;
          }
        } catch (err) {
          console.error('[NodeStatusStream] Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[NodeStatusStream] WebSocket error:', err);
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Auto-reconnect after 5s
        if (mountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [url, enabled]);
}