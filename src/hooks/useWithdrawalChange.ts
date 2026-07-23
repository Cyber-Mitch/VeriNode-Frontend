/**
 * Hook for managing withdrawal credential change pipeline
 * 
 * Provides high-level interface for the complete workflow including
 * request creation, signature collection, and broadcasting.
 */

import { useState, useEffect, useCallback } from 'react';
import { useChangeRequestStore } from '@/store/changeRequestSlice';
import type { 
  BLSToExecutionChangeMessage, 
  WithdrawalChangeRequest,
  ApprovalProgress 
} from '@/types/withdrawalChange';
import { signMessageHash, verifySignature } from '@/utils/blsToExecutionChange';

export interface UseWithdrawalChangeReturn {
  // State
  requests: WithdrawalChangeRequest[];
  selectedRequest: WithdrawalChangeRequest | null;
  approvalProgress: ApprovalProgress | null;
  loading: boolean;
  error: string | null;

  // Actions
  createRequest: (message: BLSToExecutionChangeMessage, initiator: string) => Promise<string>;
  signRequest: (requestId: string, approverAddress: string, comment?: string) => Promise<void>;
  broadcastRequest: (requestId: string, actor: string) => Promise<void>;
  confirmRequest: (requestId: string, txHash: string, actor: string) => Promise<void>;
  failRequest: (requestId: string, error: string, actor: string) => Promise<void>;
  deleteRequest: (requestId: string) => Promise<void>;
  selectRequest: (requestId: string | null) => void;
  refreshRequests: () => Promise<void>;
  clearError: () => void;
}

/**
 * Main hook for withdrawal change management
 */
export function useWithdrawalChange(): UseWithdrawalChangeReturn {
  const {
    requests,
    selectedRequestId,
    loading,
    error: storeError,
    loadRequests,
    createRequest: createRequestAction,
    addSignature,
    broadcastRequest: broadcastRequestAction,
    confirmRequest: confirmRequestAction,
    failRequest: failRequestAction,
    deleteRequest: deleteRequestAction,
    selectRequest: selectRequestAction,
    getApprovalProgress,
  } = useChangeRequestStore();

  const [approvalProgress, setApprovalProgress] = useState<ApprovalProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find selected request
  const selectedRequest = requests.find(r => r.id === selectedRequestId) ?? null;

  // Load requests on mount
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Update approval progress when selected request changes
  useEffect(() => {
    if (selectedRequestId) {
      getApprovalProgress(selectedRequestId).then(setApprovalProgress);
    } else {
      setApprovalProgress(null);
    }
  }, [selectedRequestId, requests, getApprovalProgress]);

  // Sync store error to local error
  useEffect(() => {
    if (storeError) {
      setError(storeError);
    }
  }, [storeError]);

  /**
   * Creates a new withdrawal change request
   */
  const createRequest = useCallback(
    async (message: BLSToExecutionChangeMessage, initiator: string): Promise<string> => {
      setError(null);
      try {
        return await createRequestAction(message, initiator);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create request';
        setError(errorMsg);
        throw err;
      }
    },
    [createRequestAction]
  );

  /**
   * Signs a request as an approver
   */
  const signRequest = useCallback(
    async (requestId: string, approverAddress: string, comment?: string): Promise<void> => {
      setError(null);
      try {
        const request = requests.find(r => r.id === requestId);
        if (!request) {
          throw new Error('Request not found');
        }

        // Sign the message hash
        const signature = await signMessageHash(request.messageHash, approverAddress);

        // Verify signature before submitting
        const isValid = await verifySignature(
          request.messageHash,
          signature,
          approverAddress
        );

        if (!isValid) {
          throw new Error('Invalid signature generated');
        }

        // Submit signature
        await addSignature(requestId, approverAddress, signature, comment);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to sign request';
        setError(errorMsg);
        throw err;
      }
    },
    [requests, addSignature]
  );

  /**
   * Broadcasts an approved request to the beacon chain
   */
  const broadcastRequest = useCallback(
    async (requestId: string, actor: string): Promise<void> => {
      setError(null);
      try {
        await broadcastRequestAction(requestId, actor);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to broadcast request';
        setError(errorMsg);
        throw err;
      }
    },
    [broadcastRequestAction]
  );

  /**
   * Confirms a broadcast request
   */
  const confirmRequest = useCallback(
    async (requestId: string, txHash: string, actor: string): Promise<void> => {
      setError(null);
      try {
        await confirmRequestAction(requestId, txHash, actor);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to confirm request';
        setError(errorMsg);
        throw err;
      }
    },
    [confirmRequestAction]
  );

  /**
   * Marks a request as failed
   */
  const failRequest = useCallback(
    async (requestId: string, errorMsg: string, actor: string): Promise<void> => {
      setError(null);
      try {
        await failRequestAction(requestId, errorMsg, actor);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to mark request as failed';
        setError(errMsg);
        throw err;
      }
    },
    [failRequestAction]
  );

  /**
   * Deletes a request
   */
  const deleteRequest = useCallback(
    async (requestId: string): Promise<void> => {
      setError(null);
      try {
        await deleteRequestAction(requestId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete request';
        setError(errorMsg);
        throw err;
      }
    },
    [deleteRequestAction]
  );

  /**
   * Selects a request for detailed view
   */
  const selectRequest = useCallback(
    (requestId: string | null) => {
      selectRequestAction(requestId);
    },
    [selectRequestAction]
  );

  /**
   * Refreshes the request list
   */
  const refreshRequests = useCallback(async () => {
    setError(null);
    try {
      await loadRequests();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to refresh requests';
      setError(errorMsg);
    }
  }, [loadRequests]);

  /**
   * Clears the error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    requests,
    selectedRequest,
    approvalProgress,
    loading,
    error,
    createRequest,
    signRequest,
    broadcastRequest,
    confirmRequest,
    failRequest,
    deleteRequest,
    selectRequest,
    refreshRequests,
    clearError,
  };
}

/**
 * Hook for filtering requests by state
 */
export function useRequestsByState(state: WithdrawalChangeRequest['state']) {
  const requests = useChangeRequestStore(s => s.requests);
  return requests.filter(r => r.state === state);
}

/**
 * Hook for filtering requests by validator index
 */
export function useRequestsByValidator(validatorIndex: number) {
  const requests = useChangeRequestStore(s => s.requests);
  return requests.filter(r => r.message.validatorIndex === validatorIndex);
}

/**
 * Hook to get active request count
 */
export function useActiveRequestCount(): number {
  const requests = useChangeRequestStore(s => s.requests);
  return requests.filter(
    r => r.state !== 'failed' && r.state !== 'confirmed' && r.state !== 'expired'
  ).length;
}
