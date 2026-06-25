/**
 * Multi-step wizard for BLS-to-Execution withdrawal credential changes
 * 
 * Step 1: Validator selection + new execution address input
 * Step 2: Approver assignment and signing requests
 * Step 3: Approval progress tracking
 * Step 4: Broadcast trigger with confirmation
 */

'use client';

import { useState, useEffect } from 'react';
import { useWithdrawalChange } from '@/hooks/useWithdrawalChange';
import { loadGovernanceConfig } from '@/services/governanceService';
import type { BLSToExecutionChangeMessage, GovernanceConfig, ApproverNotification } from '@/types/withdrawalChange';
import { 
  validateBLSToExecutionChangeMessage, 
  truncateAddress, 
  formatValidatorIndex 
} from '@/utils/blsToExecutionChange';

type WizardStep = 1 | 2 | 3 | 4;

interface WithdrawalChangeWizardProps {
  onComplete?: (requestId: string) => void;
  onCancel?: () => void;
  defaultValidatorIndex?: number;
  userAddress: string;
}

export function WithdrawalChangeWizard({
  onComplete,
  onCancel,
  defaultValidatorIndex,
  userAddress,
}: WithdrawalChangeWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [governanceConfig, setGovernanceConfig] = useState<GovernanceConfig | null>(null);
  const [notifications, setNotifications] = useState<ApproverNotification[]>([]);

  // Step 1 state
  const [validatorIndex, setValidatorIndex] = useState(defaultValidatorIndex?.toString() ?? '');
  const [blsPubkey, setBlsPubkey] = useState('');
  const [executionAddress, setExecutionAddress] = useState('');
  const [validationError, setValidationError] = useState('');

  const {
    createRequest,
    signRequest,
    broadcastRequest,
    selectedRequest,
    approvalProgress,
    loading,
    error,
    selectRequest,
    clearError,
  } = useWithdrawalChange();

  // Load governance config on mount
  useEffect(() => {
    loadGovernanceConfig().then(setGovernanceConfig);
  }, []);

  /**
   * Step 1: Validate and create request
   */
  const handleStep1Submit = async () => {
    setValidationError('');
    clearError();

    const message: BLSToExecutionChangeMessage = {
      validatorIndex: parseInt(validatorIndex, 10),
      fromBlsPubkey: blsPubkey,
      toExecutionAddress: executionAddress,
    };

    const validation = validateBLSToExecutionChangeMessage(message);
    if (!validation.valid) {
      setValidationError(validation.errors.join(', '));
      return;
    }

    try {
      const id = await createRequest(message, userAddress);
      setRequestId(id);
      selectRequest(id);
      
      // Initialize notifications for all approvers
      if (governanceConfig) {
        const initialNotifications: ApproverNotification[] = governanceConfig.approvers.map(
          approver => ({
            requestId: id,
            validatorIndex: message.validatorIndex,
            approverAddress: approver,
            notificationType: 'both',
            status: 'pending',
          })
        );
        setNotifications(initialNotifications);
      }
      
      setStep(2);
    } catch (err) {
      console.error('Failed to create request:', err);
    }
  };

  /**
   * Step 2: Send notification to approvers
   */
  const handleSendNotifications = async () => {
    // In production, this would call an API to send emails/web3 notifications
    // For now, we'll just mark them as sent
    setNotifications(prev => 
      prev.map(n => ({ ...n, status: 'sent' as const, sentAt: Date.now() }))
    );
    setStep(3);
  };

  /**
   * Step 3: Sign as current user (if they're an approver)
   */
  const handleSign = async (comment?: string) => {
    if (!requestId) return;

    try {
      await signRequest(requestId, userAddress, comment);
    } catch (err) {
      console.error('Failed to sign request:', err);
    }
  };

  /**
   * Step 4: Broadcast to beacon chain
   */
  const handleBroadcast = async () => {
    if (!requestId) return;

    try {
      await broadcastRequest(requestId, userAddress);
      
      // In production, this would call the beacon node API
      // For now, simulate confirmation
      setTimeout(() => {
        if (onComplete) {
          onComplete(requestId);
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to broadcast request:', err);
    }
  };

  /**
   * Move to approval monitoring step when threshold is met
   */
  useEffect(() => {
    if (step === 3 && approvalProgress?.isComplete) {
      setStep(4);
    }
  }, [approvalProgress, step]);

  const canProceedToStep2 = validatorIndex && blsPubkey && executionAddress;
  const isUserApprover = governanceConfig?.approvers.some(
    a => a.toLowerCase() === userAddress.toLowerCase()
  );
  const hasUserSigned = selectedRequest?.signatures.some(
    s => s.approverAddress.toLowerCase() === userAddress.toLowerCase()
  );

  return (
    <div className="withdrawal-change-wizard">
      <div className="wizard-header">
        <h2>Change Withdrawal Credentials</h2>
        <div className="wizard-steps">
          <div className={`wizard-step ${step >= 1 ? 'active' : ''}`}>1. Configure</div>
          <div className={`wizard-step ${step >= 2 ? 'active' : ''}`}>2. Notify</div>
          <div className={`wizard-step ${step >= 3 ? 'active' : ''}`}>3. Approve</div>
          <div className={`wizard-step ${step >= 4 ? 'active' : ''}`}>4. Broadcast</div>
        </div>
      </div>

      <div className="wizard-content">
        {/* Step 1: Configuration */}
        {step === 1 && (
          <div className="wizard-step-content">
            <h3>Step 1: Configure Change Request</h3>
            <p className="step-description">
              Enter the validator details and new execution address for withdrawal credentials.
            </p>

            <div className="form-group">
              <label htmlFor="validatorIndex">Validator Index</label>
              <input
                id="validatorIndex"
                type="number"
                value={validatorIndex}
                onChange={(e) => setValidatorIndex(e.target.value)}
                placeholder="Enter validator index"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="blsPubkey">Current BLS Public Key (0x00...)</label>
              <input
                id="blsPubkey"
                type="text"
                value={blsPubkey}
                onChange={(e) => setBlsPubkey(e.target.value)}
                placeholder="0x00..."
                className="form-input"
                maxLength={98}
              />
              <small>96 hex characters (48 bytes)</small>
            </div>

            <div className="form-group">
              <label htmlFor="executionAddress">New Execution Address (0x...)</label>
              <input
                id="executionAddress"
                type="text"
                value={executionAddress}
                onChange={(e) => setExecutionAddress(e.target.value)}
                placeholder="0x..."
                className="form-input"
                maxLength={42}
              />
              <small>Ethereum address (40 hex characters)</small>
            </div>

            {validationError && (
              <div className="error-message">{validationError}</div>
            )}
            {error && <div className="error-message">{error}</div>}

            <div className="wizard-actions">
              <button onClick={onCancel} className="btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button
                onClick={handleStep1Submit}
                className="btn-primary"
                disabled={!canProceedToStep2 || loading}
              >
                {loading ? 'Creating...' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Notify Approvers */}
        {step === 2 && governanceConfig && (
          <div className="wizard-step-content">
            <h3>Step 2: Notify Approvers</h3>
            <p className="step-description">
              Request {governanceConfig.threshold} of {governanceConfig.totalApprovers} approvers to sign.
            </p>

            <div className="approver-list">
              {notifications.map((notification) => (
                <div key={notification.approverAddress} className="approver-item">
                  <div className="approver-address">
                    {truncateAddress(notification.approverAddress)}
                  </div>
                  <div className="notification-status">
                    {notification.status === 'sent' && notification.sentAt && (
                      <span className="status-sent">✓ Notified</span>
                    )}
                    {notification.status === 'pending' && (
                      <span className="status-pending">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="wizard-actions">
              <button onClick={() => setStep(1)} className="btn-secondary">
                Back
              </button>
              <button onClick={handleSendNotifications} className="btn-primary">
                Send Notifications & Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Approval Progress */}
        {step === 3 && approvalProgress && selectedRequest && (
          <div className="wizard-step-content">
            <h3>Step 3: Collect Approvals</h3>
            <p className="step-description">
              Waiting for approvers to sign. {approvalProgress.collected} of{' '}
              {approvalProgress.required} signatures collected.
            </p>

            <div className="approval-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${approvalProgress.percentage}%` }}
                />
              </div>
              <div className="progress-label">
                {approvalProgress.percentage}% Complete
              </div>
            </div>

            <div className="expiry-notice">
              <strong>Expires in:</strong> {Math.round(approvalProgress.hoursUntilExpiry)} hours
            </div>

            <div className="signatures-list">
              <h4>Signatures ({selectedRequest.signatures.length})</h4>
              {selectedRequest.signatures.map((sig, index) => (
                <div key={index} className="signature-item">
                  <div className="signature-approver">
                    ✓ {truncateAddress(sig.approverAddress)}
                  </div>
                  <div className="signature-time">
                    {new Date(sig.timestamp).toLocaleString()}
                  </div>
                  {sig.comment && (
                    <div className="signature-comment">{sig.comment}</div>
                  )}
                </div>
              ))}
            </div>

            {isUserApprover && !hasUserSigned && (
              <div className="sign-section">
                <h4>Sign as Approver</h4>
                <button onClick={() => handleSign()} className="btn-primary" disabled={loading}>
                  {loading ? 'Signing...' : 'Sign Request'}
                </button>
              </div>
            )}

            {approvalProgress.remainingApprovers.length > 0 && (
              <div className="remaining-approvers">
                <h4>Waiting for:</h4>
                {approvalProgress.remainingApprovers.map((addr) => (
                  <div key={addr} className="remaining-approver">
                    {truncateAddress(addr)}
                  </div>
                ))}
              </div>
            )}

            <div className="wizard-actions">
              <button onClick={onCancel} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Broadcast */}
        {step === 4 && selectedRequest && (
          <div className="wizard-step-content">
            <h3>Step 4: Broadcast to Beacon Chain</h3>
            <p className="step-description">
              All required approvals have been collected. Ready to broadcast the change request.
            </p>

            <div className="broadcast-summary">
              <div className="summary-item">
                <strong>Validator:</strong> {formatValidatorIndex(selectedRequest.message.validatorIndex)}
              </div>
              <div className="summary-item">
                <strong>New Address:</strong> {truncateAddress(selectedRequest.message.toExecutionAddress)}
              </div>
              <div className="summary-item">
                <strong>Signatures:</strong> {selectedRequest.signatures.length} / {selectedRequest.threshold}
              </div>
            </div>

            {selectedRequest.state === 'broadcast' && (
              <div className="broadcast-status">
                <p>Broadcasting to beacon chain...</p>
              </div>
            )}

            {selectedRequest.state === 'confirmed' && (
              <div className="broadcast-success">
                <p>✓ Successfully broadcast!</p>
                {selectedRequest.txHash && (
                  <p>Transaction: {truncateAddress(selectedRequest.txHash)}</p>
                )}
              </div>
            )}

            {selectedRequest.state === 'failed' && (
              <div className="broadcast-error">
                <p>✗ Broadcast failed</p>
                {selectedRequest.error && <p>{selectedRequest.error}</p>}
              </div>
            )}

            <div className="wizard-actions">
              {selectedRequest.state === 'approved' && (
                <button
                  onClick={handleBroadcast}
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Broadcasting...' : 'Broadcast Now'}
                </button>
              )}
              {(selectedRequest.state === 'confirmed' || selectedRequest.state === 'failed') && (
                <button onClick={() => onComplete?.(requestId!)} className="btn-primary">
                  Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .withdrawal-change-wizard {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem;
        }

        .wizard-header {
          margin-bottom: 2rem;
        }

        .wizard-header h2 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .wizard-steps {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .wizard-step {
          flex: 1;
          padding: 0.5rem;
          text-align: center;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: #f5f5f5;
        }

        .wizard-step.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .wizard-step-content {
          padding: 1.5rem;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
        }

        .wizard-step-content h3 {
          margin: 0 0 0.5rem 0;
        }

        .step-description {
          color: #666;
          margin-bottom: 1.5rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group small {
          display: block;
          color: #666;
          margin-top: 0.25rem;
          font-size: 0.875rem;
        }

        .wizard-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #eee;
        }

        .btn-primary,
        .btn-secondary {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .btn-primary {
          background: #007bff;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .btn-primary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #545b62;
        }

        .error-message {
          padding: 0.75rem;
          background: #fee;
          color: #c33;
          border: 1px solid #fcc;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .approver-list {
          margin: 1.5rem 0;
        }

        .approver-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .status-sent {
          color: #28a745;
        }

        .status-pending {
          color: #ffc107;
        }

        .approval-progress {
          margin: 2rem 0;
        }

        .progress-bar {
          height: 24px;
          background: #f0f0f0;
          border-radius: 12px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: #28a745;
          transition: width 0.3s;
        }

        .progress-label {
          text-align: center;
          margin-top: 0.5rem;
          font-weight: 500;
        }

        .expiry-notice {
          padding: 0.75rem;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          margin: 1rem 0;
        }

        .signatures-list,
        .remaining-approvers,
        .sign-section {
          margin: 1.5rem 0;
        }

        .signatures-list h4,
        .remaining-approvers h4,
        .sign-section h4 {
          margin: 0 0 1rem 0;
        }

        .signature-item,
        .remaining-approver {
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .signature-comment {
          margin-top: 0.5rem;
          font-style: italic;
          color: #666;
        }

        .broadcast-summary {
          margin: 1.5rem 0;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .summary-item {
          margin-bottom: 0.5rem;
        }

        .broadcast-status,
        .broadcast-success,
        .broadcast-error {
          padding: 1rem;
          border-radius: 4px;
          margin: 1rem 0;
        }

        .broadcast-status {
          background: #e7f3ff;
          border: 1px solid #007bff;
        }

        .broadcast-success {
          background: #d4edda;
          border: 1px solid #28a745;
          color: #155724;
        }

        .broadcast-error {
          background: #f8d7da;
          border: 1px solid #dc3545;
          color: #721c24;
        }
      `}</style>
    </div>
  );
}
