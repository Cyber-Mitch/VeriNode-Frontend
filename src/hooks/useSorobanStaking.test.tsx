import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock the wallet so the hook has a source account without a WalletProvider.
vi.mock('@/src/hooks/useWallet', () => ({
  useWallet: () => ({
    activeAccount: { publicKey: 'GTESTACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', provider: 'freighter' },
    pendingAccountSwitch: false,
  }),
}));

import { useSorobanStaking } from '@/src/hooks/useSorobanStaking';
import { useStakingStore } from '@/src/store/stakingStore';

const RPC_ENDPOINT = 'https://soroban-rpc.stellar.org';

// By default the RPC simulates a FAILED on-chain execution (HostError), which
// drives the rollback path. Individual tests can override this handler.
const server = setupServer(
  http.post(RPC_ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as { method: string };
    if (body.method === 'sendTransaction') {
      return HttpResponse.json({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'HostError: contract trapped' },
      });
    }
    return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: { status: 'not_found' } });
  })
);

const INITIAL_BALANCE = 1000;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

beforeEach(() => {
  useStakingStore.getState().reset();
  useStakingStore.getState().initBalance(INITIAL_BALANCE);
});

describe('useSorobanStaking optimistic updates', () => {
  it('applies an optimistic balance change immediately, then rolls back on failure and re-applies on retry', async () => {
    const { result } = renderHook(() => useSorobanStaking());

    // (a)+(b) stake(100): the optimistic delta is applied synchronously,
    // before the network round-trip resolves.
    let pending: Promise<void>;
    act(() => {
      pending = result.current.stake(100);
    });
    expect(useStakingStore.getState().optimisticBalance).toBe(INITIAL_BALANCE - 100); // 900

    // (c) the simulated on-chain execution fails...
    await act(async () => {
      await pending;
    });

    // (d) ...so the balance reverts to the original value.
    expect(useStakingStore.getState().optimisticBalance).toBe(INITIAL_BALANCE); // 1000
    const failed = useStakingStore.getState().pending.find((p) => p.status === 'failed');
    expect(failed).toBeDefined();

    // (e) retry() re-enters the optimistic state with the same parameters.
    let retried: Promise<void>;
    act(() => {
      retried = result.current.retry(failed!.optimisticTxId);
    });
    expect(useStakingStore.getState().optimisticBalance).toBe(INITIAL_BALANCE - 100); // 900 again

    await act(async () => {
      await retried;
    });
  });
});
