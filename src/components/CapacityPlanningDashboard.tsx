'use client';

import type { CapacityPlan } from '@/src/services/capacityPlanningService';

interface CapacityPlanningDashboardProps {
  plan: CapacityPlan;
}

function statusClass(status: string): string {
  if (status === 'critical') return 'border-red-300 bg-red-50 text-red-900';
  if (status === 'warning') return 'border-yellow-300 bg-yellow-50 text-yellow-900';
  return 'border-green-300 bg-green-50 text-green-900';
}

export function CapacityPlanningDashboard({ plan }: CapacityPlanningDashboardProps) {
  return (
    <section aria-labelledby="capacity-planning-title" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="capacity-planning-title" className="text-lg font-semibold text-gray-900">
            Capacity planning
          </h2>
          <p className="text-sm text-gray-600">
            Historical usage trends over {plan.windowDays} days with 7-day and 30-day projections.
          </p>
        </div>
        <span className="text-xs text-gray-500">Generated {new Date(plan.generatedAt).toLocaleString()}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plan.forecasts.map(forecast => (
          <article key={`${forecast.service}-${forecast.metric}`} className={`rounded-md border p-3 ${statusClass(forecast.status)}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{forecast.service} / {forecast.metric}</h3>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold uppercase">{forecast.status}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs opacity-75">Current</dt><dd>{forecast.current} {forecast.unit}</dd></div>
              <div><dt className="text-xs opacity-75">Daily trend</dt><dd>{forecast.trendPerDay} {forecast.unit}/day</dd></div>
              <div><dt className="text-xs opacity-75">7-day</dt><dd>{forecast.projected7d} {forecast.unit}</dd></div>
              <div><dt className="text-xs opacity-75">30-day</dt><dd>{forecast.projected30d} {forecast.unit}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {plan.alerts.length > 0 && (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-semibold text-gray-900">Alerts</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {plan.alerts.map(alert => <li key={alert.id}>{alert.message}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
