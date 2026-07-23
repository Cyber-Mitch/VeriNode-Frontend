export type SyncPhase = 'Bootstrap' | 'Historical' | 'Live Tail';

export function detectSyncPhase(progress: number): SyncPhase {
  if (progress < 0.01) {
    return 'Bootstrap';
  } else if (progress < 0.99) {
    return 'Historical';
  } else {
    return 'Live Tail';
  }
}
