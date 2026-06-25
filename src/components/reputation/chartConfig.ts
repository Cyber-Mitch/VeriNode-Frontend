import type { ChartOptions } from 'chart.js';

/**
 * Chart.js configuration for reputation trend chart
 * Optimized for performance with batched updates
 */
export const reputationChartConfig: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false, // Disable animation for performance
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        color: 'rgb(148, 163, 184)', // slate-400
        font: {
          size: 12,
        },
      },
    },
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(15, 23, 42, 0.9)', // slate-900
      titleColor: 'rgb(226, 232, 240)', // slate-200
      bodyColor: 'rgb(203, 213, 225)', // slate-300
      borderColor: 'rgb(51, 65, 85)', // slate-700
      borderWidth: 1,
      padding: 10,
      displayColors: false,
      callbacks: {
        title: (context) => {
          const timestamp = context[0].parsed.x;
          return timestamp ? new Date(timestamp).toLocaleString() : '';
        },
        label: (context) => {
          return `Reputation: ${context.parsed.y?.toFixed(0) ?? 'N/A'}`;
        },
      },
    },
  },
  scales: {
    x: {
      type: 'time',
      time: {
        unit: 'minute',
        displayFormats: {
          minute: 'HH:mm',
          hour: 'HH:mm',
        },
      },
      ticks: {
        color: 'rgb(148, 163, 184)', // slate-400
        maxTicksLimit: 10,
      },
      grid: {
        color: 'rgba(51, 65, 85, 0.3)', // slate-700 with opacity
        display: true,
      },
    },
    y: {
      beginAtZero: false,
      ticks: {
        color: 'rgb(148, 163, 184)', // slate-400
        callback: (value) => value.toString(),
      },
      grid: {
        color: 'rgba(51, 65, 85, 0.3)', // slate-700 with opacity
        display: true,
      },
    },
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
  elements: {
    line: {
      tension: 0.2, // Slight curve for better aesthetics
      borderWidth: 2,
      borderColor: 'rgb(56, 189, 248)', // sky-400
    },
    point: {
      radius: 0, // Hide points for performance
      hitRadius: 10,
      hoverRadius: 4,
      hoverBorderWidth: 2,
    },
  },
};

/**
 * Create chart dataset configuration
 */
export function createReputationDataset(label: string, data: { x: number; y: number }[]) {
  return {
    label,
    data,
    borderColor: 'rgb(56, 189, 248)', // sky-400
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    fill: true,
    tension: 0.2,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderWidth: 2,
  };
}
