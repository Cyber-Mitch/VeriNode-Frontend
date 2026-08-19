'use client';

/**
 * VestingDashboard
 *
 * The top-level vesting feature component. Consumes useVesting and
 * orchestrates all sub-components:
 *
 *   1. VestingOverview  – schedule cards with progress bars & claim buttons
 *   2. VestingTimeline  – horizontal bar timeline per schedule
 *   3. UpcomingUnlocks  – next 5 unlock events with live countdown
 *   4. ClaimHistory     – paginated past claims with CSV export
 *
 * Also handles the "Claim" flow: shows a gas-estimate confirmation modal
 * before submitting (requirement from the issue).
 */

import { useState, useCallback } from 'react';
import { useVesting } from '@/src/hooks/useVesting';
import { useWallet } from '@/src/hooks/useWallet';
import { VestingOverview } from '@/src/components/vesting/VestingOverview';
import { VestingTimelineList } from '@/src/components/vesting/VestingTimeline';
import { UpcomingUnlocks } from '@/src/components/vesting/UpcomingUnlocks';
import { ClaimHistory } from '@/src/components/vesting/ClaimHistory';
import type { VestingSchedule } from '@/src/types/vesting';

// ── Gas estimate confirmation modal ──────────────────────────────────────────

interface ClaimModalProps {
  schedule: VestingSchedule;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Simple inline modal that shows the claimable amount and a mock gas estimate
 * before the user confirms the claim transaction.
 */
function ClaimModal({ schedule, onConfirm, onCancel }: ClaimModalProps) {
  // Mock gas estimate — replace with real gas estimation when backend is wired.
  const gasEstimateGwei = 42_000;
  const gasEstimateUsd = 0.08;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-5">
        <h2
          id="claim-modal-title"
          className="text-lg font-semibold text-white"
        >
          Confirm Claim
        </h2>

        <div className="space-y-2 text-sm text-slate-300">
          <p>
            You are about to claim tokens from{' '}
            <span className="font-semibold text-white">{schedule.label}</span>.
          </p>

          <div className="rounded-lg bg-slate-800/60 px-4 py-3 space-y-1.5">
            <Row label="Claimable amount">
              <span className="text-emerald-400 font-semibold">
                {schedule.claimableAmount.toLocaleString()} {schedule.tokenSymbol}
              </span>
            </Row>
            <Row label="Estimated gas">
              <span className="text-slate-300">
                {gasEstimateGwei.toLocaleString()} Gwei ≈ ${gasEstimateUsd}
              </span>
            </Row>
          </div>

          <p className="text-xs text-slate-500">
            Gas estimates are approximate. The actual amount may vary.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700/60 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            Confirm Claim
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      {children}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-white border-b border-white/10 pb-2">{title}</h2>
      {children}
    </section>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function VestingDashboard() {
  const { activeAccount } = useWallet();
  const address = activeAccount?.publicKey ?? '';

  const { data, isLoading, isError, error, tokenPriceUsd } = useVesting();

  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  /** Tracks schedule IDs that have been successfully claimed in this session. */
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  const handleClaimRequest = useCallback((scheduleId: string) => {
    setPendingClaimId(scheduleId);
  }, []);

  const handleClaimConfirm = useCallback(() => {
    if (pendingClaimId) {
      // TODO: dispatch actual on-chain claim transaction via wallet signer.
      // Mark as claimed in local session state so the UI can reflect it.
      setClaimedIds((prev) => new Set([...prev, pendingClaimId]));
    }
    setPendingClaimId(null);
  }, [pendingClaimId]);

  const handleClaimCancel = useCallback(() => {
    setPendingClaimId(null);
  }, []);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-40 rounded-xl bg-slate-800/60" />
        <div className="h-28 rounded-xl bg-slate-800/60" />
        <div className="h-48 rounded-xl bg-slate-800/60" />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Failed to load vesting data:{' '}
        {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  // ── No wallet connected ─────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-6 text-center text-sm text-amber-400">
        Connect your wallet to view vesting schedules.
      </div>
    );
  }

  if (!data) return null;

  const pendingSchedule = data.schedules.find((s) => s.id === pendingClaimId) ?? null;

  return (
    <>
      {/* Claim confirmation modal */}
      {pendingSchedule && (
        <ClaimModal
          schedule={pendingSchedule}
          onConfirm={handleClaimConfirm}
          onCancel={handleClaimCancel}
        />
      )}

      <div className="space-y-10">
        {/* ── Overview: schedule cards ────────────────────────────────────── */}
        <Section title="Vesting Schedules">
          {/* Zero-out claimableAmount for schedules claimed in this session
              so the Claim button disappears immediately after confirming. */}
          <VestingOverview
            schedules={data.schedules.map((s) =>
              claimedIds.has(s.id) ? { ...s, claimableAmount: 0 } : s,
            )}
            tokenPriceUsd={tokenPriceUsd}
            onClaim={handleClaimRequest}
          />
        </Section>

        {/* ── Timeline ───────────────────────────────────────────────────── */}
        <Section title="Timeline">
          <VestingTimelineList schedules={data.schedules} />
        </Section>

        {/* ── Upcoming unlocks ───────────────────────────────────────────── */}
        <Section title="Upcoming Unlocks">
          <UpcomingUnlocks
            unlocks={data.upcomingUnlocks}
            schedules={data.schedules}
            onClaim={handleClaimRequest}
          />
        </Section>

        {/* ── Claim history ──────────────────────────────────────────────── */}
        <Section title="Claim History">
          <ClaimHistory records={data.claimHistory} address={address} />
        </Section>
      </div>
    </>
  );
}
