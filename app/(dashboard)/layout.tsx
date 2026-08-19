'use client';

import { SyncStatusBar } from '@/src/components/SyncStatusBar';
import { OfflineBanner } from '@/src/components/layout/OfflineBanner';
import { WSHealthTier3Banner } from '@/src/components/layout/WSHealthTier3Banner';

// Full dashboard layout — SyncStatusBar and OfflineBanner are only loaded
// for routes inside (dashboard), keeping the auth/login critical path lean.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineBanner />
      <WSHealthTier3Banner />
      {children}
      <SyncStatusBar />
    </>
  );
}
