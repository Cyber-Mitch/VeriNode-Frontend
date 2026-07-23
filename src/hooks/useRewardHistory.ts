'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/src/hooks/useWallet';
import { flushGuard } from '@/src/hooks/flushGuard';

interface RewardEntry {
  id: string;
  amount: string;
  timestamp: number;
  type: 'staking' | 'attestation' | 'referral';
}

interface RewardHistory {
  rewards: RewardEntry[];
  totalEarned: string;
}

async function fetchRewardHistory(publicKey: string): Promise<RewardHistory> {
  const response = await fetch(`/api/rewards/${publicKey}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch reward history: ${response.statusText}`);
  }
  return response.json();
}

export function useRewardHistory() {
  const { activeAccount, pendingAccountSwitch } = useWallet();
  const publicKey = activeAccount?.publicKey;

  const query = useQuery<RewardHistory>({
    queryKey: ['rewards', publicKey],
    queryFn: () => fetchRewardHistory(publicKey!),
    enabled: !!publicKey && !pendingAccountSwitch,
    staleTime: 5 * 60 * 1000,
  });

  const guard = flushGuard(publicKey, activeAccount);
  if (guard.guardFailed || pendingAccountSwitch) {
    return {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      guardMessage: guard.guardMessage,
    };
  }

  return query;
}
