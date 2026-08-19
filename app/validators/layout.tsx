'use client';

import { SyncStatusBar } from '@/src/components/SyncStatusBar';
import { OfflineBanner } from '@/src/components/layout/OfflineBanner';
import { WSHealthTier3Banner } from '@/src/components/layout/WSHealthTier3Banner';

// Scopes SyncStatusBar + OfflineBanner to validator routes only.
// Auth/login routes never load these components.
export default function ValidatorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineBanner />
      <WSHealthTier3Banner />
      {children}
      <SyncStatusBar />
    </>
  );
}
