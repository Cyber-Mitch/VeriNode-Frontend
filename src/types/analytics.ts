export interface AggregateConfig {
  nodeIds?: string[];
  groupBy: 'none' | 'day' | 'week' | 'month';
}

export interface AggregateResult {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  count: number;
  grouped?: Record<string, Omit<AggregateResult, 'grouped'>>;
}

export type WorkerRequest =
  | { type: 'COMPUTE'; payload: { data: Float64Array; config: AggregateConfig; requestId: string } }
  | { type: 'ABORT'; payload: { requestId: string } };

export type WorkerResponse =
  | { type: 'RESULT'; payload: { requestId: string; result: AggregateResult } }
  | { type: 'PROGRESS'; payload: { requestId: string; progress: number } }
  | { type: 'ERROR'; payload: { requestId: string; message: string } };

export interface AnalyticsState {
  result: AggregateResult | null;
  progress: number;
  isComputing: boolean;
  error: string | null;
}

export interface NodeDataPoint {
  timestamp: number;
  nodeId: string;
  latency: number;
  uptime: number;
  reward: number;
}
