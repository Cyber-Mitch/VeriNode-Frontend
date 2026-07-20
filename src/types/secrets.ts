export type SecretKind = 'database-credential' | 'api-key' | 'token' | 'encryption-key';

export type RotationStatus = 'active' | 'rotating' | 'expiring' | 'expired' | 'revoked';

export interface SecretVersion {
  id: string;
  value: string;
  createdAt: number;
  expiresAt: number;
  sequence: number;
}

export interface SecretRecord {
  key: string;
  kind: SecretKind;
  status: RotationStatus;
  versions: SecretVersion[];
  rotationIntervalMs: number;
  maxVersions: number;
  lastRotatedAt: number | null;
  nextRotationAt: number | null;
}

export interface RotationPolicy {
  rotationIntervalMs: number;
  maxVersions: number;
  overlapMs: number;
}

export interface RotationEvent {
  type:
    | 'rotation:started'
    | 'rotation:completed'
    | 'rotation:failed'
    | 'secret:expiring'
    | 'secret:expired'
    | 'secret:revoked'
    | 'version:deactivated';
  key: string;
  status: RotationStatus;
  versionId?: string;
  timestamp: number;
  error?: string;
}

export type RotationEventListener = (event: RotationEvent) => void;

export interface RotationMetrics {
  totalRotations: number;
  failedRotations: number;
  activeSecrets: number;
  expiredSecrets: number;
  lastRotationLatencyMs: number | null;
}
