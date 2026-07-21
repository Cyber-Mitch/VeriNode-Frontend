'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DelegationNode, DelegationEdge, ValidatorStatus } from '@/src/types/delegation';
import { liquidStakingService, WSEvent } from '@/src/services/liquidStakingService';

export interface UseDelegationFlowFilters {
  selectedProtocol: string; // 'all' or protocol ID
  minAmount: number; // minimum amount to display
  timeRange: [number, number]; // [startTimestamp, endTimestamp]
  validatorStatus: ValidatorStatus | 'all';
}

export function useDelegationFlow() {
  const [nodes, setNodes] = useState<DelegationNode[]>([]);
  const [edges, setEdges] = useState<DelegationEdge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Time bounds of dataset
  const [timeBounds, setTimeBounds] = useState<[number, number]>([
    Date.now() - 30 * 24 * 3600 * 1000,
    Date.now()
  ]);

  const [filters, setFilters] = useState<UseDelegationFlowFilters>({
    selectedProtocol: 'all',
    minAmount: 0,
    timeRange: [Date.now() - 30 * 24 * 3600 * 1000, Date.now()],
    validatorStatus: 'all'
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Fetch initial graph data
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        const data = await liquidStakingService.fetchAllGraphData();
        if (!active) return;

        setNodes(data.nodes);
        setEdges(data.edges);

        // Compute initial time bounds from data
        if (data.edges.length > 0) {
          const timestamps = data.edges.map((e) => e.timestamp);
          const minT = Math.min(...timestamps);
          const maxT = Math.max(...timestamps);
          setTimeBounds([minT, maxT]);
          setFilters((f) => ({
            ...f,
            timeRange: [minT, maxT]
          }));
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to fetch delegation data');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  // Handle WebSocket / real-time updates incrementally
  useEffect(() => {
    if (loading) return;

    const unsubscribe = liquidStakingService.subscribeToUpdates((event: WSEvent) => {
      if (event.type === 'new_delegation') {
        // Incrementally add node if it doesn't exist
        if (event.node) {
          setNodes((prevNodes) => {
            if (prevNodes.some((n) => n.id === event.node!.id)) return prevNodes;
            return [...prevNodes, event.node!];
          });
        }
        // Incrementally add edge
        setEdges((prevEdges) => [...prevEdges, event.edge]);

        // Dynamically adjust time bounds
        setTimeBounds((prev) => {
          const newMax = Math.max(prev[1], event.edge.timestamp);
          const newMin = Math.min(prev[0], event.edge.timestamp);
          return [newMin, newMax];
        });

      } else if (event.type === 'reward') {
        // Incrementally add reward edge
        setEdges((prevEdges) => [...prevEdges, event.edge]);

        // Dynamically adjust time bounds
        setTimeBounds((prev) => {
          const newMax = Math.max(prev[1], event.edge.timestamp);
          const newMin = Math.min(prev[0], event.edge.timestamp);
          return [newMin, newMax];
        });

      } else if (event.type === 'unstake') {
        // Decrease amount on the edge or remove it if 0
        setEdges((prevEdges) => {
          return prevEdges
            .map((edge) => {
              if (edge.source === event.source && edge.target === event.target && edge.type === 'deposit') {
                const nextAmount = Math.max(0, edge.amount - event.amount);
                return { ...edge, amount: nextAmount };
              }
              return edge;
            })
            .filter((edge) => edge.amount > 0.01);
        });
      }
    });

    return () => unsubscribe();
  }, [loading]);

  // Setters for filters
  const setProtocolFilter = useCallback((protocolId: string) => {
    setFilters((f) => ({ ...f, selectedProtocol: protocolId }));
  }, []);

  const setMinAmountFilter = useCallback((amount: number) => {
    setFilters((f) => ({ ...f, minAmount: amount }));
  }, []);

  const setTimeRangeFilter = useCallback((range: [number, number]) => {
    setFilters((f) => ({ ...f, timeRange: range }));
  }, []);

  const setValidatorStatusFilter = useCallback((status: ValidatorStatus | 'all') => {
    setFilters((f) => ({ ...f, validatorStatus: status }));
  }, []);

  // Compute filtered edges and nodes
  const filteredData = useMemo(() => {
    // 1. Filter edges
    const filteredEdges = edges.filter((edge) => {
      // Filter by min amount
      if (edge.amount < filters.minAmount) return false;

      // Filter by time range
      if (edge.timestamp < filters.timeRange[0] || edge.timestamp > filters.timeRange[1]) return false;

      // Filter by selected protocol
      if (filters.selectedProtocol !== 'all') {
        // Edge must connect to the selected protocol
        if (edge.source !== filters.selectedProtocol && edge.target !== filters.selectedProtocol) {
          return false;
        }
      }

      return true;
    });

    // 2. Filter nodes
    const activeNodeIds = new Set<string>();
    filteredEdges.forEach((e) => {
      activeNodeIds.add(e.source);
      activeNodeIds.add(e.target);
    });

    const filteredNodes = nodes.filter((node) => {
      // Always include selected protocol node
      if (filters.selectedProtocol !== 'all' && node.id === filters.selectedProtocol) {
        return true;
      }

      // Filter validator by status
      if (node.type === 'validator') {
        if (filters.validatorStatus !== 'all' && node.metadata.status !== filters.validatorStatus) {
          return false;
        }
      }

      // Remove orphaned nodes (except when we are not filtering, but usually we only want connected nodes in the graph view)
      return activeNodeIds.has(node.id);
    });

    return {
      nodes: filteredNodes,
      edges: filteredEdges
    };
  }, [nodes, edges, filters]);

  // Find selected node details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  return {
    nodes: filteredData.nodes,
    edges: filteredData.edges,
    allNodes: nodes, // raw node list for filters
    loading,
    error,
    filters,
    timeBounds,
    selectedNodeId,
    selectedNode,
    setProtocolFilter,
    setMinAmountFilter,
    setTimeRangeFilter,
    setValidatorStatusFilter,
    setSelectedNodeId
  };
}
