import { DelegationNode, DelegationEdge } from '@/src/types/delegation';

// Mock data generator for fallback and demonstration
const MOCK_PROTOCOLS: DelegationNode[] = [
  {
    id: 'proto-lido',
    type: 'protocol',
    label: 'Lido Finance (stETH)',
    metadata: { apr: 3.8, delegatorCount: 4210, totalStake: 154200.5 }
  },
  {
    id: 'proto-rocketpool',
    type: 'protocol',
    label: 'Rocket Pool (rETH)',
    metadata: { apr: 4.1, delegatorCount: 2315, totalStake: 82400.2 }
  },
  {
    id: 'proto-swell',
    type: 'protocol',
    label: 'Swell Network (swETH)',
    metadata: { apr: 3.9, delegatorCount: 940, totalStake: 34100.8 }
  }
];

const MOCK_VALIDATORS: DelegationNode[] = [
  {
    id: 'val-p2p',
    type: 'validator',
    label: 'P2P Validator',
    metadata: { status: 'active', apr: 4.2, delegatorCount: 1500, totalStake: 95000.0 }
  },
  {
    id: 'val-chorus',
    type: 'validator',
    label: 'Chorus One',
    metadata: { status: 'active', apr: 4.0, delegatorCount: 1200, totalStake: 72000.0 }
  },
  {
    id: 'val-figment',
    type: 'validator',
    label: 'Figment',
    metadata: { status: 'active', apr: 3.9, delegatorCount: 1800, totalStake: 88000.0 }
  },
  {
    id: 'val-exiting',
    type: 'validator',
    label: 'Sigma Operator',
    metadata: { status: 'exiting', apr: 1.5, delegatorCount: 300, totalStake: 12000.0 }
  },
  {
    id: 'val-slashed',
    type: 'validator',
    label: 'Alpha Node (Slashed)',
    metadata: { status: 'slashed', apr: 0.0, delegatorCount: 45, totalStake: 3700.0 }
  }
];

// Initial mock delegators
const MOCK_DELEGATORS: DelegationNode[] = Array.from({ length: 15 }, (_, i) => ({
  id: `del-user-${i + 1}`,
  type: 'delegator',
  label: `Holder ${String(i + 1).padStart(3, '0')}`,
  metadata: { totalStake: Math.round((Math.random() * 50 + 5) * 10) / 10 }
}));

const generateInitialMockEdges = (): DelegationEdge[] => {
  const edges: DelegationEdge[] = [];
  const now = Date.now();

  // 1. Delegators -> Protocols (deposits)
  MOCK_DELEGATORS.forEach((del) => {
    // Deposit into 1 or 2 protocols
    const activeProtos = [...MOCK_PROTOCOLS];
    const numDeposits = Math.random() > 0.6 ? 2 : 1;
    for (let d = 0; d < numDeposits; d++) {
      const idx = Math.floor(Math.random() * activeProtos.length);
      const proto = activeProtos.splice(idx, 1)[0];
      const amount = Math.round((del.metadata.totalStake! / numDeposits) * 100) / 100;
      edges.push({
        source: del.id,
        target: proto.id,
        amount,
        type: 'deposit',
        timestamp: now - Math.floor(Math.random() * 30 * 24 * 3600 * 1000)
      });
    }
  });

  // 2. Protocols -> Validators (delegate)
  // Let Lido delegate to P2P, Chorus, Figment, and Exiting
  edges.push({ source: 'proto-lido', target: 'val-p2p', amount: 65000, type: 'delegate', timestamp: now - 20 * 24 * 3600 * 1000 });
  edges.push({ source: 'proto-lido', target: 'val-chorus', amount: 45200, type: 'delegate', timestamp: now - 18 * 24 * 3600 * 1000 });
  edges.push({ source: 'proto-lido', target: 'val-figment', amount: 40000, type: 'delegate', timestamp: now - 15 * 24 * 3600 * 1000 });
  edges.push({ source: 'proto-lido', target: 'val-slashed', amount: 4000, type: 'delegate', timestamp: now - 25 * 24 * 3600 * 1000 });

  // Rocket Pool delegates to Figment, Chorus, and exiting
  edges.push({ source: 'proto-rocketpool', target: 'val-figment', amount: 48000, type: 'delegate', timestamp: now - 12 * 24 * 3600 * 1000 });
  edges.push({ source: 'proto-rocketpool', target: 'val-chorus', amount: 26800, type: 'delegate', timestamp: now - 10 * 24 * 3600 * 1000 });
  edges.push({ source: 'proto-rocketpool', target: 'val-exiting', amount: 7600, type: 'delegate', timestamp: now - 14 * 24 * 3600 * 1000 });

  // Swell delegates to P2P and Chorus
  edges.push({ source: 'proto-swell', target: 'val-p2p', amount: 30000, type: 'delegate', timestamp: now - 5 * 24 * 3600 * 1000 });
  edges.push({ source: 'proto-swell', target: 'val-chorus', amount: 4100, type: 'delegate', timestamp: now - 8 * 24 * 3600 * 1000 });

  // 3. Validators -> Protocols (rewards)
  MOCK_VALIDATORS.forEach((val) => {
    // Find who delegates to this validator
    if (val.metadata.status !== 'slashed') {
      const parentEdges = edges.filter(e => e.target === val.id && e.type === 'delegate');
      parentEdges.forEach(pe => {
        edges.push({
          source: val.id,
          target: pe.source,
          amount: Math.round(pe.amount * (val.metadata.apr! / 100) * 0.1 * 100) / 100, // mock rewards
          type: 'rewards',
          timestamp: now - Math.floor(Math.random() * 24 * 3600 * 1000)
        });
      });
    }
  });

  // 4. Protocols -> Delegators (distributions)
  MOCK_DELEGATORS.forEach((del) => {
    const parentEdges = edges.filter(e => e.source === del.id && e.type === 'deposit');
    parentEdges.forEach(pe => {
      const proto = MOCK_PROTOCOLS.find(p => p.id === pe.target);
      if (proto) {
        edges.push({
          source: pe.target,
          target: del.id,
          amount: Math.round(pe.amount * (proto.metadata.apr! / 100) * 0.1 * 100) / 100,
          type: 'distributions',
          timestamp: now - Math.floor(Math.random() * 24 * 3600 * 1000)
        });
      }
    });
  });

  return edges;
};

const activeMockEdges = generateInitialMockEdges();
const activeMockDelegators = [...MOCK_DELEGATORS];

export interface GraphData {
  nodes: DelegationNode[];
  edges: DelegationEdge[];
}

export type WSEvent =
  | { type: 'new_delegation'; edge: DelegationEdge; node?: DelegationNode }
  | { type: 'unstake'; source: string; target: string; amount: number }
  | { type: 'reward'; edge: DelegationEdge };

class LiquidStakingService {
  private wsSubscribers: Set<(event: WSEvent) => void> = new Set();
  private wsInterval: NodeJS.Timeout | null = null;

  async fetchProtocols(): Promise<DelegationNode[]> {
    try {
      const res = await fetch('/protocols');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch protocols from backend, using mock data.', e);
    }
    return MOCK_PROTOCOLS;
  }

  async fetchValidators(): Promise<DelegationNode[]> {
    try {
      const res = await fetch('/validators/stake');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch validators from backend, using mock data.', e);
    }
    return MOCK_VALIDATORS;
  }

  async fetchDelegations(): Promise<DelegationEdge[]> {
    try {
      const res = await fetch('/delegations');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch delegations from backend, using mock data.', e);
    }
    return activeMockEdges;
  }

  async fetchAllGraphData(): Promise<GraphData> {
    const [protocols, validators, edges] = await Promise.all([
      this.fetchProtocols(),
      this.fetchValidators(),
      this.fetchDelegations()
    ]);

    // Gather all unique delegator nodes connected by edges
    const delegatorIds = new Set<string>();
    edges.forEach((edge) => {
      if (edge.source.startsWith('del-')) delegatorIds.add(edge.source);
      if (edge.target.startsWith('del-')) delegatorIds.add(edge.target);
    });

    const delegatorNodes = activeMockDelegators.filter((d) => delegatorIds.has(d.id));

    return {
      nodes: [...delegatorNodes, ...protocols, ...validators],
      edges
    };
  }

  subscribeToUpdates(onEvent: (event: WSEvent) => void): () => void {
    this.wsSubscribers.add(onEvent);

    // Start simulation if not already running
    if (!this.wsInterval) {
      this.startWsSimulation();
    }

    return () => {
      this.wsSubscribers.delete(onEvent);
      if (this.wsSubscribers.size === 0 && this.wsInterval) {
        clearInterval(this.wsInterval);
        this.wsInterval = null;
      }
    };
  }

  private startWsSimulation() {
    this.wsInterval = setInterval(() => {
      if (this.wsSubscribers.size === 0) return;

      const rand = Math.random();
      const now = Date.now();

      if (rand < 0.4) {
        // 1. Generate new delegation (depositing)
        const newDelId = `del-user-${activeMockDelegators.length + 1}`;
        const amount = Math.round((Math.random() * 40 + 5) * 10) / 10;
        const newDelegator: DelegationNode = {
          id: newDelId,
          type: 'delegator',
          label: `Holder ${String(activeMockDelegators.length + 1).padStart(3, '0')}`,
          metadata: { totalStake: amount }
        };
        activeMockDelegators.push(newDelegator);

        const targetProto = MOCK_PROTOCOLS[Math.floor(Math.random() * MOCK_PROTOCOLS.length)];
        const edge: DelegationEdge = {
          source: newDelId,
          target: targetProto.id,
          amount,
          type: 'deposit',
          timestamp: now
        };
        activeMockEdges.push(edge);

        const event: WSEvent = {
          type: 'new_delegation',
          edge,
          node: newDelegator
        };
        this.notifySubscribers(event);

      } else if (rand < 0.7) {
        // 2. Generate reward distribution (Validator -> Protocol)
        const validator = MOCK_VALIDATORS[Math.floor(Math.random() * MOCK_VALIDATORS.length)];
        if (validator.metadata.status !== 'slashed') {
          // Find matching protocol
          const targetProto = MOCK_PROTOCOLS[Math.floor(Math.random() * MOCK_PROTOCOLS.length)];
          const rewardAmount = Math.round((Math.random() * 5 + 0.1) * 100) / 100;
          const edge: DelegationEdge = {
            source: validator.id,
            target: targetProto.id,
            amount: rewardAmount,
            type: 'rewards',
            timestamp: now
          };
          activeMockEdges.push(edge);

          const event: WSEvent = {
            type: 'reward',
            edge
          };
          this.notifySubscribers(event);
        }
      } else {
        // 3. Unstake event (decrease delegation)
        // Find a deposit edge
        const depositEdges = activeMockEdges.filter(e => e.type === 'deposit');
        if (depositEdges.length > 0) {
          const edgeToUnstake = depositEdges[Math.floor(Math.random() * depositEdges.length)];
          const unstakeAmount = Math.round((edgeToUnstake.amount * 0.25) * 100) / 100; // Unstake 25%

          if (unstakeAmount > 0.1) {
            edgeToUnstake.amount -= unstakeAmount;
            const event: WSEvent = {
              type: 'unstake',
              source: edgeToUnstake.source,
              target: edgeToUnstake.target,
              amount: unstakeAmount
            };
            this.notifySubscribers(event);
          }
        }
      }
    }, 6000); // Trigger every 6 seconds
  }

  private notifySubscribers(event: WSEvent) {
    this.wsSubscribers.forEach((sub) => {
      try {
        sub(event);
      } catch (err) {
        console.error('Subscriber error in LiquidStakingService', err);
      }
    });
  }
}

export const liquidStakingService = new LiquidStakingService();
