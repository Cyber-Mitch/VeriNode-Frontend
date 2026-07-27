'use client';

import { useMemo } from 'react';
import { generateDemoSloEvaluations } from '@/src/services/slo/sloMonitoringService';
import type { SloEvaluation, SloSeverity } from '@/src/types/slo';

const SEVERITY_STYLES: Record<SloSeverity, string> = {
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  critical: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

function formatTte(hours: number | null): string {
  if (hours === null) return 'Budget stable';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function EvaluationCard({ evaluation }: { evaluation: SloEvaluation }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{evaluation.objective.name}</h3>
          <p className="mt-1 text-xs text-slate-400">{evaluation.objective.description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${SEVERITY_STYLES[evaluation.severity]}`}>
          {evaluation.severity}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-900/80 p-3">
          <dt className="text-slate-500">Window</dt>
          <dd className="mt-1 font-semibold text-slate-100">{evaluation.sample.window}</dd>
        </div>
        <div className="rounded-xl bg-slate-900/80 p-3">
          <dt className="text-slate-500">Observed SLI</dt>
          <dd className="mt-1 font-semibold text-slate-100">{formatPercent(evaluation.observed)}</dd>
        </div>
        <div className="rounded-xl bg-slate-900/80 p-3">
          <dt className="text-slate-500">Burn rate</dt>
          <dd className="mt-1 font-semibold text-slate-100">{evaluation.burnRate.toFixed(1)}x</dd>
        </div>
        <div className="rounded-xl bg-slate-900/80 p-3">
          <dt className="text-slate-500">Time to exhaust</dt>
          <dd className="mt-1 font-semibold text-slate-100">{formatTte(evaluation.timeToExhaustionHours)}</dd>
        </div>
      </dl>

      {evaluation.reasons.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-slate-300">
          {evaluation.reasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function SloMonitoringDashboard() {
  const evaluations = useMemo(() => generateDemoSloEvaluations(), []);
  const criticalCount = evaluations.filter((item) => item.severity === 'critical').length;
  const warningCount = evaluations.filter((item) => item.severity === 'warning').length;

  return (
    <section className="space-y-6 rounded-3xl border border-slate-800 bg-slate-950 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">SLO burn-rate monitoring</h2>
          <p className="mt-1 text-sm text-slate-400">
            Tracks 99.99% availability and &lt;100ms P99 critical-path objectives with multi-window alert signals.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-300">{criticalCount} paging</span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-300">{warningCount} ticket</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {evaluations.map((evaluation) => (
          <EvaluationCard key={`${evaluation.objective.id}-${evaluation.sample.window}`} evaluation={evaluation} />
        ))}
      </div>
    </section>
  );
}
