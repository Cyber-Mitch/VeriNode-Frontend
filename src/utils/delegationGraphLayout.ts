import { DelegationNode, DelegationEdge } from '@/src/types/delegation';

export interface LayoutOptions {
  width: number;
  height: number;
  nodePaddingFactor?: number; // scaling factor for label padding
  sideMargin?: number;
  topBottomMargin?: number;
  iterations?: number;
}

export function layoutDelegationGraph(
  nodes: DelegationNode[],
  edges: DelegationEdge[],
  options: LayoutOptions
): DelegationNode[] {
  const {
    width,
    height,
    nodePaddingFactor = 6,
    sideMargin = 60,
    topBottomMargin = 80,
    iterations = 3
  } = options;

  if (nodes.length === 0) return [];

  // 1. Layer Assignment
  const l0 = nodes.filter((n) => n.type === 'delegator');
  const l1 = nodes.filter((n) => n.type === 'protocol');
  const l2 = nodes.filter((n) => n.type === 'validator');

  // Helper to get connected nodes in undirected fashion
  const getNeighbors = (nodeId: string): string[] => {
    const neighbors = new Set<string>();
    edges.forEach((edge) => {
      if (edge.source === nodeId) neighbors.add(edge.target);
      if (edge.target === nodeId) neighbors.add(edge.source);
    });
    return Array.from(neighbors);
  };

  // 2. Barycenter Heuristic for Cross-Edge Minimization
  // We will run a few iterations to optimize the order of nodes within layers
  let l0Order = [...l0];
  let l1Order = [...l1];
  let l2Order = [...l2];

  for (let iter = 0; iter < iterations; iter++) {
    // Forward Pass: L0 -> L1 -> L2
    // Optimize L1 based on L0
    l1Order = sortLayerByBarycenter(l1Order, l0Order, getNeighbors);
    // Optimize L2 based on L1
    l2Order = sortLayerByBarycenter(l2Order, l1Order, getNeighbors);

    // Backward Pass: L2 -> L1 -> L0
    // Optimize L1 based on L2
    l1Order = sortLayerByBarycenter(l1Order, l2Order, getNeighbors);
    // Optimize L0 based on L1
    l0Order = sortLayerByBarycenter(l0Order, l1Order, getNeighbors);
  }

  // 3. Node Positioning
  // Calculate Y coordinates
  const y0 = topBottomMargin;
  const y1 = height / 2;
  const y2 = height - topBottomMargin;

  const positionedNodes: DelegationNode[] = [];

  const positionLayer = (layerNodes: DelegationNode[], y: number) => {
    const N = layerNodes.length;
    if (N === 0) return;

    if (N === 1) {
      positionedNodes.push({
        ...layerNodes[0],
        x: width / 2,
        y
      });
      return;
    }

    // Compute padding proportional to label length
    const paddings = layerNodes.map((n) => n.label.length * nodePaddingFactor);
    const totalPadding = paddings.reduce((sum, p) => sum + p, 0);

    const availWidth = width - 2 * sideMargin;
    const remainingWidth = availWidth - totalPadding;

    if (remainingWidth > 0) {
      // Space nodes proportionally including label-length padding
      const gap = remainingWidth / (N - 1);
      let currentX = sideMargin;

      layerNodes.forEach((node, idx) => {
        const nodeWidth = paddings[idx];
        // Center of the node padding block
        const x = currentX + nodeWidth / 2;
        positionedNodes.push({
          ...node,
          x,
          y
        });
        currentX += nodeWidth + gap;
      });
    } else {
      // Fallback: If not enough width, distribute centers evenly
      const step = availWidth / (N - 1);
      layerNodes.forEach((node, idx) => {
        positionedNodes.push({
          ...node,
          x: sideMargin + idx * step,
          y
        });
      });
    }
  };

  positionLayer(l0Order, y0);
  positionLayer(l1Order, y1);
  positionLayer(l2Order, y2);

  return positionedNodes;
}

// Computes the barycenter of each node in targetLayer relative to sourceLayer, and sorts targetLayer
function sortLayerByBarycenter(
  targetLayer: DelegationNode[],
  sourceLayer: DelegationNode[],
  getNeighbors: (id: string) => string[]
): DelegationNode[] {
  const sourcePositionMap = new Map<string, number>();
  sourceLayer.forEach((node, idx) => {
    sourcePositionMap.set(node.id, idx);
  });

  const getBarycenterValue = (node: DelegationNode): number => {
    const neighbors = getNeighbors(node.id);
    const sourceNeighbors = neighbors.filter((nid) => sourcePositionMap.has(nid));

    if (sourceNeighbors.length === 0) return 0;

    const sumPositions = sourceNeighbors.reduce((sum, nid) => {
      return sum + sourcePositionMap.get(nid)!;
    }, 0);

    return sumPositions / sourceNeighbors.length;
  };

  // Sort nodes based on their barycenter values
  return [...targetLayer].sort((a, b) => {
    const baryA = getBarycenterValue(a);
    const baryB = getBarycenterValue(b);
    if (baryA !== baryB) return baryA - baryB;
    return a.id.localeCompare(b.id); // Tie breaker
  });
}
