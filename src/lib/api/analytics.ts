import type { NodeDataPoint } from '@/src/types/analytics';

const NODE_COUNT = 1000;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export async function fetchNetworkAnalytics(
  startTime: number,
  endTime: number,
): Promise<NodeDataPoint[]> {
  const duration = endTime - startTime;
  const pointCount = Math.min(Math.floor(duration), SECONDS_PER_YEAR);

  const points: NodeDataPoint[] = [];
  const sampleRate = Math.max(1, Math.floor(pointCount / (SECONDS_PER_YEAR / 10)));

  for (let t = 0; t < pointCount; t += sampleRate) {
    const nodeId = `node-${Math.floor(Math.random() * NODE_COUNT)}`;
    const baseLatency = 20 + Math.random() * 180;
    const latency = baseLatency + Math.sin(t / 3600) * 10 + (Math.random() - 0.5) * 20;
    const uptime = Math.random() > 0.02 ? 1 : 0.98 + Math.random() * 0.02;
    const reward = 0.1 + Math.random() * 0.9;

    points.push({
      timestamp: startTime + t * 1000,
      nodeId,
      latency: Math.round(latency * 100) / 100,
      uptime: Math.round(uptime * 10000) / 10000,
      reward: Math.round(reward * 10000) / 10000,
    });
  }

  return points;
}

export function toFloat64Array(points: NodeDataPoint[]): Float64Array {
  return new Float64Array(points.map((p) => p.latency));
}
