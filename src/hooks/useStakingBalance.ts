'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/src/hooks/useWallet';
import { flushGuard } from '@/src/hooks/flushGuard';

interface StakingBalance {
  staked: string;
  rewards: string;
  unlocked: string;
}

async function fetchStakingBalance(publicKey: string): Promise<StakingBalance> {
  const response = await fetch(`/api/staking/${publicKey}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch staking balance: ${response.statusText}`);
  }
  return response.json();
}

export function useStakingBalance() {
  const { activeAccount, pendingAccountSwitch } = useWallet();
  const publicKey = activeAccount?.publicKey;

  const query = useQuery<StakingBalance>({
    queryKey: ['staking', publicKey],
    queryFn: () => fetchStakingBalance(publicKey!),
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
