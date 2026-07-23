export function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-slate-800/60"
      style={{ height }}
      role="status"
      aria-label="Loading chart…"
    />
  );
}
