import { describe, expect, it } from 'vitest';
import {
  claimJobs,
  completeJob,
  failJob,
  reclaimExpiredLeases,
  schedulerAlerts,
  schedulerMetrics,
} from '../distributedJobScheduler';
import type { SchedulerJob } from '../../types/distributedScheduler';

const baseJob = (overrides: Partial<SchedulerJob> = {}): SchedulerJob => ({
  id: 'job-1',
  queue: 'validator-duty',
  payload: { validatorIndex: 42 },
  status: 'queued',
  priority: 1,
  attempts: 0,
  maxAttempts: 3,
  runAt: 1_000,
  createdAt: 900,
  updatedAt: 900,
  ...overrides,
});

const tokenFactory = (jobId: string, workerId: string, now: number) => `${jobId}:${workerId}:${now}:token`;

describe('distributed job scheduler', () => {
  it('claims eligible jobs by priority and FIFO tie-breakers', () => {
    const jobs = [
      baseJob({ id: 'low', priority: 1, createdAt: 10 }),
      baseJob({ id: 'high-newer', priority: 5, createdAt: 20 }),
      baseJob({ id: 'high-older', priority: 5, createdAt: 5 }),
    ];

    const result = claimJobs(jobs, { workerId: 'worker-a', queue: 'validator-duty', now: 2_000, leaseDurationMs: 30_000, maxJobs: 2 }, tokenFactory);

    expect(result.claimed.map((job) => job.id)).toEqual(['high-older', 'high-newer']);
    expect(result.claimed.every((job) => job.leaseOwnerId === 'worker-a')).toBe(true);
    expect(result.claimed.every((job) => job.leaseExpiresAt === 32_000)).toBe(true);
  });

  it('reclaims expired leases without double-completing stale tokens', () => {
    const leased = baseJob({ status: 'leased', attempts: 1, leaseOwnerId: 'worker-a', leaseToken: 'old-token', leaseExpiresAt: 1_500 });

    const reclaimed = reclaimExpiredLeases([leased], 2_000);
    expect(reclaimed[0].status).toBe('queued');
    expect(reclaimed[0].leaseToken).toBeUndefined();

    const completed = completeJob(reclaimed, { workerId: 'worker-a', leaseToken: 'old-token', now: 2_100 });
    expect(completed[0].status).toBe('queued');
  });

  it('moves exhausted jobs to the dead-letter queue after a failed lease', () => {
    const leased = baseJob({ status: 'leased', attempts: 3, maxAttempts: 3, leaseOwnerId: 'worker-a', leaseToken: 'lease-token', leaseExpiresAt: 5_000 });

    const failed = failJob([leased], { workerId: 'worker-a', leaseToken: 'lease-token', now: 2_000, retryDelayMs: 10_000, error: 'rpc timeout' });

    expect(failed[0].status).toBe('dead-lettered');
    expect(failed[0].lastError).toBe('rpc timeout');
  });

  it('emits monitoring alerts for latency, expired leases, and dead letters', () => {
    const jobs = [
      baseJob({ id: 'leased', status: 'leased', leaseExpiresAt: 1_000 }),
      baseJob({ id: 'dead', status: 'dead-lettered' }),
    ];

    const metrics = schedulerMetrics(jobs, [10, 20, 125], 2_000);
    expect(metrics.expiredLeases).toBe(1);
    expect(schedulerAlerts(metrics).map((alert) => alert.id)).toEqual([
      'scheduler-claim-p99',
      'scheduler-expired-leases',
      'scheduler-dead-letter',
    ]);
  });
});
