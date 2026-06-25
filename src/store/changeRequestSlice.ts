/**
 * Zustand store for withdrawal change request state management
 * 
 * Manages request lifecycle, concurrent requests, and real-time updates.
 */

import { create } from 'zustand';
import type { 
  WithdrawalChangeRequest, 
  ApprovalProgress,
  BLSToExecutionChangeMessage 
} from '@/types/withdrawalChange';
import { MAX_CONCURRENT_REQUESTS, REQUEST_EXPIRY_MS } from '@/types/withdrawalChange';
import * as changeRequestStore from '@/services/changeRequestStore';
import * as governanceService from '@/services/governanceService';
import { constructBLSToExecutionChange } from '@/utils/blsToExecutionChange';
import { createAuditEntry, getGenesisHash } from '@/utils/auditChain';
import { saveAuditEntry, getAuditLogs } from '@/services/changeRequestStore';

interface ChangeRequestState {
  // State
  requests: WithdrawalChangeRequest[];
  selectedRequestId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  loadRequests: () => Promise<void>;
  createRequest: (
    message: BLSToExecutionChangeMessage,
    initiator: string
  ) => Promise<string>;
  addSignature: (
    requestId: string,
    approverAddress: string,
    signature: string,
    comment?: string
  ) => Promise<void>;
  updateRequestState: (
    requestId: string,
    newState: WithdrawalChangeRequest['state'],
    actor: string,
    error?: string
  ) => Promise<void>;
  broadcastRequest: (requestId: string, actor: string) => Promise<void>;
  confirmRequest: (requestId: string, txHash: string, actor: string) => Promise<void>;
  failRequest: (requestId: string, error: string, actor: string) => Promise<void>;
  deleteRequest: (requestId: string) => Promise<void>;
  selectRequest: (requestId: string | null) => void;
  getApprovalProgress: (requestId: string) => Promise<ApprovalProgress | null>;
  cleanupExpired: () => Promise<void>;
  reset: () => void;
}

export const useChangeRequestStore = create<ChangeRequestState>((set, get) => ({
  requests: [],
  selectedRequestId: null,
  loading: false,
  error: null,

  /**
   * Loads all requests from IndexedDB
   */
  loadRequests: async () => {
    set({ loading: true, error: null });
    try {
      const requests = await changeRequestStore.getAllChangeRequests();
      set({ requests, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load requests',
        loading: false 
      });
    }
  },

  /**
   * Creates a new withdrawal change request
   */
  createRequest: async (message, initiator) => {
    const activeCount = await changeRequestStore.getActiveRequestCount();
    if (activeCount >= MAX_CONCURRENT_REQUESTS) {
      throw new Error(`Maximum concurrent requests (${MAX_CONCURRENT_REQUESTS}) reached`);
    }

    set({ loading: true, error: null });
    try {
      // Construct SSZ message and hash
      const { sszEncoded, messageHash } = await constructBLSToExecutionChange(message);

      // Load governance config
      const config = await governanceService.loadGovernanceConfig();

      // Create request
      const now = Date.now();
      const request: WithdrawalChangeRequest = {
        id: generateRequestId(),
        message,
        sszEncoded,
        messageHash,
        state: 'draft',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + REQUEST_EXPIRY_MS,
        signatures: [],
        threshold: config.threshold,
        approvers: config.approvers,
        initiator,
      };

      // Save to IndexedDB
      await changeRequestStore.saveChangeRequest(request);

      // Create audit entry
      const auditEntry = await createAuditEntry(
        request.id,
        'created',
        initiator,
        getGenesisHash(),
        { data: { validatorIndex: message.validatorIndex } }
      );
      await saveAuditEntry(auditEntry);

      // Update state
      const requests = [...get().requests, request];
      set({ requests, loading: false });

      return request.id;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create request',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Adds an approver signature to a request
   */
  addSignature: async (requestId, approverAddress, signature, comment) => {
    set({ loading: true, error: null });
    try {
      const request = await changeRequestStore.getChangeRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Check if already signed by this approver
      if (request.signatures.some(s => 
        s.approverAddress.toLowerCase() === approverAddress.toLowerCase()
      )) {
        throw new Error('Approver has already signed this request');
      }

      // Verify approver is eligible
      const config = await governanceService.loadGovernanceConfig();
      if (!config.approvers.some(a => 
        a.toLowerCase() === approverAddress.toLowerCase()
      )) {
        throw new Error('Address is not an eligible approver');
      }

      // Add signature
      const updatedRequest: WithdrawalChangeRequest = {
        ...request,
        signatures: [
          ...request.signatures,
          {
            approverAddress,
            signature,
            timestamp: Date.now(),
            comment,
          },
        ],
        updatedAt: Date.now(),
      };

      // Check if threshold is met and auto-transition to approved
      if (updatedRequest.signatures.length >= updatedRequest.threshold) {
        updatedRequest.state = 'approved';
      } else if (updatedRequest.state === 'draft') {
        updatedRequest.state = 'pending_approval';
      }

      // Save updated request
      await changeRequestStore.saveChangeRequest(updatedRequest);

      // Create audit entry
      const auditLogs = await getAuditLogs(requestId);
      const previousHash = auditLogs.length > 0 
        ? auditLogs[auditLogs.length - 1].entryHash 
        : getGenesisHash();
      
      const auditEntry = await createAuditEntry(
        requestId,
        'signature_added',
        approverAddress,
        previousHash,
        {
          data: {
            signatureCount: updatedRequest.signatures.length,
            threshold: updatedRequest.threshold,
            comment,
          },
        }
      );
      await saveAuditEntry(auditEntry);

      // If state changed to approved, create state change audit entry
      if (updatedRequest.state === 'approved' && request.state !== 'approved') {
        const stateAuditEntry = await createAuditEntry(
          requestId,
          'state_changed',
          'system',
          auditEntry.entryHash,
          {
            previousState: request.state,
            newState: 'approved',
          }
        );
        await saveAuditEntry(stateAuditEntry);
      }

      // Update state
      const requests = get().requests.map(r => 
        r.id === requestId ? updatedRequest : r
      );
      set({ requests, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to add signature',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Updates the state of a request
   */
  updateRequestState: async (requestId, newState, actor, error) => {
    set({ loading: true, error: null });
    try {
      const request = await changeRequestStore.getChangeRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      const updatedRequest: WithdrawalChangeRequest = {
        ...request,
        state: newState,
        updatedAt: Date.now(),
        error,
      };

      await changeRequestStore.saveChangeRequest(updatedRequest);

      // Create audit entry
      const auditLogs = await getAuditLogs(requestId);
      const previousHash = auditLogs.length > 0 
        ? auditLogs[auditLogs.length - 1].entryHash 
        : getGenesisHash();
      
      const auditEntry = await createAuditEntry(
        requestId,
        'state_changed',
        actor,
        previousHash,
        {
          previousState: request.state,
          newState,
          data: error ? { error } : undefined,
        }
      );
      await saveAuditEntry(auditEntry);

      // Update state
      const requests = get().requests.map(r => 
        r.id === requestId ? updatedRequest : r
      );
      set({ requests, loading: false });
    } catch (err) {
      set({ 
        error: err instanceof Error ? err.message : 'Failed to update request state',
        loading: false 
      });
      throw err;
    }
  },

  /**
   * Broadcasts a request to the beacon chain
   */
  broadcastRequest: async (requestId, actor) => {
    set({ loading: true, error: null });
    try {
      const request = await changeRequestStore.getChangeRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      if (request.state !== 'approved') {
        throw new Error('Request must be approved before broadcasting');
      }

      // Update state to broadcast
      await get().updateRequestState(requestId, 'broadcast', actor);

      // Create broadcast audit entry
      const auditLogs = await getAuditLogs(requestId);
      const previousHash = auditLogs.length > 0 
        ? auditLogs[auditLogs.length - 1].entryHash 
        : getGenesisHash();
      
      const auditEntry = await createAuditEntry(
        requestId,
        'broadcast',
        actor,
        previousHash,
        {
          data: {
            sszEncoded: request.sszEncoded,
            messageHash: request.messageHash,
          },
        }
      );
      await saveAuditEntry(auditEntry);

      set({ loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to broadcast request',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Confirms a broadcast request with transaction hash
   */
  confirmRequest: async (requestId, txHash, actor) => {
    set({ loading: true, error: null });
    try {
      const request = await changeRequestStore.getChangeRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      const updatedRequest: WithdrawalChangeRequest = {
        ...request,
        state: 'confirmed',
        txHash,
        updatedAt: Date.now(),
      };

      await changeRequestStore.saveChangeRequest(updatedRequest);

      // Create confirmed audit entry
      const auditLogs = await getAuditLogs(requestId);
      const previousHash = auditLogs.length > 0 
        ? auditLogs[auditLogs.length - 1].entryHash 
        : getGenesisHash();
      
      const auditEntry = await createAuditEntry(
        requestId,
        'confirmed',
        actor,
        previousHash,
        {
          newState: 'confirmed',
          data: { txHash },
        }
      );
      await saveAuditEntry(auditEntry);

      // Update state
      const requests = get().requests.map(r => 
        r.id === requestId ? updatedRequest : r
      );
      set({ requests, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to confirm request',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Marks a request as failed
   */
  failRequest: async (requestId, errorMsg, actor) => {
    await get().updateRequestState(requestId, 'failed', actor, errorMsg);
  },

  /**
   * Deletes a request
   */
  deleteRequest: async (requestId) => {
    set({ loading: true, error: null });
    try {
      await changeRequestStore.deleteChangeRequest(requestId);
      const requests = get().requests.filter(r => r.id !== requestId);
      set({ requests, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete request',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Selects a request for detailed view
   */
  selectRequest: (requestId) => {
    set({ selectedRequestId: requestId });
  },

  /**
   * Gets approval progress for a request
   */
  getApprovalProgress: async (requestId) => {
    try {
      const request = await changeRequestStore.getChangeRequest(requestId);
      if (!request) {
        return null;
      }

      const config = await governanceService.loadGovernanceConfig();
      const signedAddresses = request.signatures.map(s => s.approverAddress);
      const remainingApprovers = governanceService.getRemainingApprovers(config, signedAddresses);
      
      const collected = request.signatures.length;
      const required = request.threshold;
      const percentage = Math.min(100, Math.round((collected / required) * 100));
      const hoursUntilExpiry = Math.max(0, (request.expiresAt - Date.now()) / (1000 * 60 * 60));

      return {
        requestId,
        collected,
        required,
        percentage,
        remainingApprovers,
        isComplete: collected >= required,
        hoursUntilExpiry,
      };
    } catch (error) {
      console.error('Failed to get approval progress:', error);
      return null;
    }
  },

  /**
   * Cleans up expired requests
   */
  cleanupExpired: async () => {
    try {
      const deletedCount = await changeRequestStore.cleanupExpiredRequests();
      
      // Mark expired requests in store
      const now = Date.now();
      const requests = get().requests.map(r => {
        if ((r.state === 'draft' || r.state === 'pending_approval') && r.expiresAt <= now) {
          return { ...r, state: 'expired' as const };
        }
        return r;
      });

      set({ requests });
      
      console.log(`Cleaned up ${deletedCount} expired requests`);
    } catch (error) {
      console.error('Failed to cleanup expired requests:', error);
    }
  },

  /**
   * Resets the store
   */
  reset: () => {
    set({
      requests: [],
      selectedRequestId: null,
      loading: false,
      error: null,
    });
  },
}));

/**
 * Generates unique request ID
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `req_${timestamp}_${random}`;
}

/**
 * Hook to start periodic cleanup of expired requests
 */
export function useExpiryCleanup(intervalMs = 60000): void {
  const cleanupExpired = useChangeRequestStore(state => state.cleanupExpired);

  if (typeof window !== 'undefined') {
    // Run cleanup on mount
    cleanupExpired();

    // Set up periodic cleanup
    const interval = setInterval(() => {
      cleanupExpired();
    }, intervalMs);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }
}
