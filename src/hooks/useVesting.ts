'use client';

/**
 * useVesting
 *
 * Fetches the vesting schedule for the connected wallet.
 *
 * Data flow:
 *   1. Resolve wallet address via useWallet.
 *   2. Fetch current token price via a parallel useQuery (CoinGecko).
 *   3. Fetch vesting data from /api/v1/vesting/{address}, merging the
 *      live price for estimated USD values.
 *
 * Uses @tanstack/react-query v5 (NOT swr). Stale time 5 min for vesting
 * data, 10 min for price data (price changes slowly enough).
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/src/hooks/useWallet';
import { flushGuard } from '@/src/hooks/flushGuard';
import { fetchVestingData } from '@/src/services/vestingService';
import { fetchEthPrice } from '@/src/services/coingeckoService';
import type { VestingData } from '@/src/types/vesting';

/** Re-export so consumers can import the type from the hook file. */
export type { VestingData };

/** Token id to use when fetching prices. Defaults to 'ethereum' as a stand-in;
 *  replace with the actual VNT token id when listed on CoinGecko. */
const TOKEN_COINGECKO_ID = 'ethereum';

export function useVesting() {
  const { activeAccount, pendingAccountSwitch } = useWallet();
  const publicKey = activeAccount?.publicKey;

  // ── 1. Price query (independent, longer stale time) ──────────────────────
  const priceQuery = useQuery<number | null>({
    queryKey: ['vesting-token-price', TOKEN_COINGECKO_ID],
    queryFn: async () => {
      try {
        return await fetchEthPrice('usd');
      } catch {
        return null; // Price unavailable – USD estimates will be null
      }
    },
    staleTime: 10 * 60 * 1000,
    enabled: true,
  });

  // ── 2. Vesting data query (wallet-keyed) ──────────────────────────────────
  const vestingQuery = useQuery<VestingData>({
    queryKey: ['vesting', publicKey],
    queryFn: () =>
      fetchVestingData({
        address: publicKey!,
        tokenPriceUsd: priceQuery.data ?? null,
      }),
    enabled: !!publicKey && !pendingAccountSwitch,
    staleTime: 5 * 60 * 1000,
  });

  // ── 3. flushGuard: guard stale wallet-keyed data during account switch ────
  const guard = flushGuard(publicKey, activeAccount);
  if (guard.guardFailed || pendingAccountSwitch) {
    return {
      data: undefined as VestingData | undefined,
      isLoading: true,
      isError: false,
      error: null,
      tokenPriceUsd: null as number | null,
      refetch: vestingQuery.refetch,
    };
  }

  return {
    data: vestingQuery.data,
    isLoading: vestingQuery.isLoading,
    isError: vestingQuery.isError,
    error: vestingQuery.error,
    tokenPriceUsd: priceQuery.data ?? null,
    refetch: vestingQuery.refetch,
  };
}
