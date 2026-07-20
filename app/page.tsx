'use client';

import { useState } from 'react';
import { useSorobanStaking } from '@/src/hooks/useSorobanStaking';
import { useToast } from '@/src/components/Toast';
import { DegradableFeature } from '@/src/components/DegradableFeature';

export default function Home() {
  const [txXDR, setTxXDR] = useState('');
  const { showToast } = useToast();
  const { submitStake, state, error, txHash } = useSorobanStaking(showToast);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txXDR.trim()) return;
    await submitStake(txXDR.trim());
  };

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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Transaction XDR
            </span>
            <textarea
              value={txXDR}
              onChange={e => setTxXDR(e.target.value)}
              placeholder="Paste your signed transaction XDR here..."
              rows={4}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>

          <button
            type="submit"
            disabled={state === 'submitting' || !txXDR.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === 'submitting' ? 'Submitting...' : 'Submit Stake'}
          </button>
        </form>

        {state === 'confirmed' && txHash && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Transaction confirmed
            <div className="mt-1 font-mono text-xs break-all">{txHash}</div>
          </div>
        )}

        {state === 'error' && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        </DegradableFeature>
      </main>
    </div>
  );
}
