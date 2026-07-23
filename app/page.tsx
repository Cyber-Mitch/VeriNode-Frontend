'use client'

import { useState } from 'react';
import { useSorobanStaking } from '@/src/hooks/useSorobanStaking';
import { useToast } from '@/src/components/Toast';
import { DegradableFeature } from '@/src/components/DegradableFeature';

export default function Home() {
  const finalityHealth = useFinalityCheckpoints()

  useEffect(() => {
    if (!hasEncryptionKey()) {
      initializeEncryption('default-pin-0000').catch(console.error)
    }
    syncManager.start()
    return () => syncManager.stop()
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 p-4 font-sans dark:bg-black">
      <main className="flex w-full max-w-lg flex-col gap-6 rounded-xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        <DegradableFeature feature="staking">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Submit Stake
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Submit your staking transaction to the Soroban network
          </p>
        </div>

        <div className="mb-6">
          <ThemeSwitcher />
        </div>

        <div className="mb-6">
          <FinalityHealthGauge snapshot={finalityHealth} />
        </div>

        <div className="mb-6">
          <DVTClusterList />
        </div>

        {state === 'error' && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        </DegradableFeature>
      </main>

      <SyncStatusBar />
    </div>
  )
}
