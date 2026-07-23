'use client';

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/src/hooks/useWallet';
import { flushGuard } from '@/src/hooks/flushGuard';

interface AttestationData {
  score: number;
  metrics: Record<string, number>;
  timestamp: number;
}

async function fetchAttestation(publicKey: string): Promise<AttestationData> {
  const response = await fetch(`/api/attestation/${publicKey}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch attestation: ${response.statusText}`);
  }
  return response.json();
}

export function useSorobanAttestation() {
  const { activeAccount, pendingAccountSwitch } = useWallet();
  const publicKey = activeAccount?.publicKey;

  const query = useQuery<AttestationData>({
    queryKey: ['attestation', publicKey],
    queryFn: () => fetchAttestation(publicKey!),
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
