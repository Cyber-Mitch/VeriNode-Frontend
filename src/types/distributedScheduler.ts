export type JobStatus = 'queued' | 'leased' | 'completed' | 'failed' | 'dead-lettered';

export interface SchedulerJob<Payload = unknown> {
  id: string;
  queue: string;
  payload: Payload;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  createdAt: number;
  updatedAt: number;
  leaseOwnerId?: string;
  leaseToken?: string;
  leaseExpiresAt?: number;
  lastError?: string;
}

export interface ClaimJobOptions {
  workerId: string;
  queue: string;
  now: number;
  leaseDurationMs: number;
  maxJobs?: number;
}

export interface CompleteJobOptions {
  workerId: string;
  leaseToken: string;
  now: number;
}

export interface FailJobOptions extends CompleteJobOptions {
  error: string;
  retryDelayMs: number;
}

export interface SchedulerMetricsSnapshot {
  queued: number;
  leased: number;
  completed: number;
  failed: number;
  deadLettered: number;
  expiredLeases: number;
  p99ClaimLatencyMs: number;
}

export interface SchedulerAlert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
}
