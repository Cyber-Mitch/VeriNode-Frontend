export type NodeType = 'delegator' | 'protocol' | 'validator';
export type EdgeType = 'deposit' | 'delegate' | 'rewards' | 'distributions';
export type ValidatorStatus = 'active' | 'exiting' | 'slashed';

export interface DelegationNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: {
    status?: ValidatorStatus;
    apr?: number;
    delegatorCount?: number;
    totalStake?: number;
    [key: string]: unknown;
  };
  // Optional layout/rendering properties
  x?: number;
  y?: number;
}

export interface DelegationEdge {
  source: string;
  target: string;
  amount: number; // in ETH or protocol token
  type: EdgeType;
  timestamp: number; // Unix timestamp in ms
}

export interface StakingMetrics {
  totalStake: number;
  activeValidators: number;
  averageApr: number;
  totalDelegators: number;
}
