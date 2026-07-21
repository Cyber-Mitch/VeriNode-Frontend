export interface PerfMetrics {
  fcp: number;
  lcp: number;
  tti: number;
  domContentLoaded: number;
  pageLoadTime: number;
  jsHeapUsed: number;
  jsHeapTotal: number;
  numRequests: number;
  totalBytes: number;
}

export interface PerfBaseline {
  timestamp: string;
  commit: string;
  metrics: PerfMetrics;
}
