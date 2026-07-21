/**
 * Reusable API mock responses for E2E tests
 */

export const mockAuthChallenge = {
  nonce: 'mock_nonce_' + Date.now(),
  serverId: 'mock_server_id',
  expiresAt: Date.now() + 300000, // 5 minutes
};

export const mockAuthVerification = {
  token: 'mock_jwt_token_' + Date.now(),
  expiresAt: Date.now() + 3600000, // 1 hour
};

export const mockStakingBalance = {
  staked: '1000.00',
  rewards: '50.25',
  unlocked: '100.00',
};

export const mockStakeResponse = (amount: string) => ({
  txHash: 'mock_tx_hash_' + Date.now(),
  amount,
  status: 'confirmed',
});

export const mockUnstakeResponse = (amount: string) => ({
  txHash: 'mock_tx_hash_' + Date.now(),
  amount,
  status: 'confirmed',
});

export const mockNodeRegistration = {
  nodeId: 'mock_node_' + Date.now(),
  status: 'registered',
};

export const mockAttestationSubmission = {
  attestationId: 'mock_attestation_' + Date.now(),
  status: 'submitted',
};

export const mockSettings = {
  notifications: true,
  theme: 'dark',
};

export const mockSettingsUpdate = (settings: Record<string, unknown>) => ({
  success: true,
  updated: settings,
});

/**
 * Common error responses
 */
export const mockErrors = {
  insufficientBalance: {
    error: 'Insufficient balance',
    code: 'INSUFFICIENT_BALANCE',
  },
  networkError: {
    error: 'Network connection failed',
    code: 'NETWORK_ERROR',
  },
  unauthorized: {
    error: 'Unauthorized',
    code: 'UNAUTHORIZED',
  },
  timeout: {
    error: 'Gateway timeout',
    code: 'GATEWAY_TIMEOUT',
  },
  badRequest: {
    error: 'Bad request',
    code: 'BAD_REQUEST',
  },
};
