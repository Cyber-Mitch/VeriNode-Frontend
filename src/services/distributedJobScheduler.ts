import type {
  ClaimJobOptions,
  CompleteJobOptions,
  FailJobOptions,
  SchedulerAlert,
  SchedulerJob,
  SchedulerMetricsSnapshot,
} from '../types/distributedScheduler';

const DEFAULT_MAX_JOBS = 1;
const MAX_LEASE_MS = 15 * 60 * 1000;

export function createLeaseToken(jobId: string, workerId: string, now: number): string {
  return `${jobId}:${workerId}:${now}:${Math.random().toString(36).slice(2, 10)}`;
}

export function isClaimable(job: SchedulerJob, queue: string, now: number): boolean {
  if (job.queue !== queue || job.status === 'completed' || job.status === 'dead-lettered') return false;
  if (job.status === 'queued') return job.runAt <= now;
  return job.status === 'leased' && (job.leaseExpiresAt ?? 0) <= now;
}

export function reclaimExpiredLeases<Payload>(jobs: SchedulerJob<Payload>[], now: number): SchedulerJob<Payload>[] {
  return jobs.map((job) => {
    if (job.status !== 'leased' || (job.leaseExpiresAt ?? Number.POSITIVE_INFINITY) > now) return job;
    return {
      ...job,
      status: job.attempts >= job.maxAttempts ? 'dead-lettered' : 'queued',
      leaseOwnerId: undefined,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    };
  });
}

export function claimJobs<Payload>(
  jobs: SchedulerJob<Payload>[],
  options: ClaimJobOptions,
  tokenFactory: (jobId: string, workerId: string, now: number) => string = createLeaseToken,
): { jobs: SchedulerJob<Payload>[]; claimed: SchedulerJob<Payload>[] } {
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const leaseDurationMs = Math.min(options.leaseDurationMs, MAX_LEASE_MS);
  const normalized = reclaimExpiredLeases(jobs, options.now);
  const claimableIds = normalized
    .filter((job) => isClaimable(job, options.queue, options.now))
    .sort((a, b) => b.priority - a.priority || a.runAt - b.runAt || a.createdAt - b.createdAt)
    .slice(0, maxJobs)
    .map((job) => job.id);
  const claimableIdSet = new Set(claimableIds);

  const claimedById = new Map<string, SchedulerJob<Payload>>();
  const nextJobs = normalized.map((job) => {
    if (!claimableIdSet.has(job.id)) return job;
    const leaseToken = tokenFactory(job.id, options.workerId, options.now);
    const nextJob: SchedulerJob<Payload> = {
      ...job,
      status: 'leased',
      attempts: job.attempts + 1,
      leaseOwnerId: options.workerId,
      leaseToken,
      leaseExpiresAt: options.now + leaseDurationMs,
      updatedAt: options.now,
    };
    claimedById.set(job.id, nextJob);
    return nextJob;
  });
  const claimed = claimableIds.flatMap((id) => {
    const job = claimedById.get(id);
    return job ? [job] : [];
  });

  return { jobs: nextJobs, claimed };
}

export function completeJob<Payload>(jobs: SchedulerJob<Payload>[], options: CompleteJobOptions): SchedulerJob<Payload>[] {
  return jobs.map((job) => {
    if (job.leaseToken !== options.leaseToken || job.leaseOwnerId !== options.workerId || job.status !== 'leased') return job;
    return { ...job, status: 'completed', leaseToken: undefined, leaseOwnerId: undefined, leaseExpiresAt: undefined, updatedAt: options.now };
  });
}

export function failJob<Payload>(jobs: SchedulerJob<Payload>[], options: FailJobOptions): SchedulerJob<Payload>[] {
  return jobs.map((job) => {
    if (job.leaseToken !== options.leaseToken || job.leaseOwnerId !== options.workerId || job.status !== 'leased') return job;
    const exhausted = job.attempts >= job.maxAttempts;
    return {
      ...job,
      status: exhausted ? 'dead-lettered' : 'failed',
      leaseToken: undefined,
      leaseOwnerId: undefined,
      leaseExpiresAt: undefined,
      runAt: exhausted ? job.runAt : options.now + options.retryDelayMs,
      updatedAt: options.now,
      lastError: options.error,
    };
  });
}

export function schedulerMetrics(jobs: SchedulerJob[], claimLatenciesMs: number[] = [], now = Date.now()): SchedulerMetricsSnapshot {
  const sorted = [...claimLatenciesMs].sort((a, b) => a - b);
  const p99Index = sorted.length === 0 ? -1 : Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1);
  return {
    queued: jobs.filter((job) => job.status === 'queued' || job.status === 'failed').length,
    leased: jobs.filter((job) => job.status === 'leased').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    deadLettered: jobs.filter((job) => job.status === 'dead-lettered').length,
    expiredLeases: jobs.filter((job) => job.status === 'leased' && (job.leaseExpiresAt ?? 0) <= now).length,
    p99ClaimLatencyMs: p99Index >= 0 ? sorted[p99Index] : 0,
  };
}

export function schedulerAlerts(metrics: SchedulerMetricsSnapshot): SchedulerAlert[] {
  const alerts: SchedulerAlert[] = [];
  if (metrics.p99ClaimLatencyMs >= 100) alerts.push({ id: 'scheduler-claim-p99', severity: 'critical', message: 'Job claim P99 is above the 100ms target.' });
  if (metrics.expiredLeases > 0) alerts.push({ id: 'scheduler-expired-leases', severity: 'warning', message: 'Expired leases are waiting to be reclaimed.' });
  if (metrics.deadLettered > 0) alerts.push({ id: 'scheduler-dead-letter', severity: 'warning', message: 'Jobs reached max attempts and moved to the dead-letter queue.' });
  return alerts;
}
