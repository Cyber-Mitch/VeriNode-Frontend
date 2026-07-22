/**
 * Voluntary Exit message construction
 *
 * Builds a minimal SSZ-encoded VoluntaryExit struct per the Ethereum consensus
 * spec (phase0) and computes its SHA-256 hash for audit-log persistence.
 *
 * SSZ layout of VoluntaryExit:
 *   epoch          : uint64  (8 bytes, little-endian)
 *   validator_index: uint64  (8 bytes, little-endian)
 * Total             : 16 bytes
 *
 * The signing domain used for voluntary exits on mainnet is:
 *   DOMAIN_VOLUNTARY_EXIT = 0x04000000
 */

export const DOMAIN_VOLUNTARY_EXIT = '0x04000000' as const;

/** Max 2 953 bytes for Version-40 QR with Medium error-correction (binary mode). */
export const QR_MAX_PAYLOAD_BYTES = 2_953;

export interface VoluntaryExitMessage {
  /** Current beacon chain epoch (fetched from /eth/v1/beacon/genesis). */
  epoch: number;
  /** Validator index on the beacon chain. */
  validatorIndex: number;
}

/**
 * Returns the domain bytes for DOMAIN_VOLUNTARY_EXIT.
 * The domain is prepended to the exit message root during signing per the spec.
 */
export function getVoluntaryExitDomain(): Uint8Array {
  // 0x04000000 as 4-byte big-endian
  return new Uint8Array([0x04, 0x00, 0x00, 0x00]);
}

/**
 * Encodes a VoluntaryExit message to SSZ (16 bytes).
 * SSZ uint64 is little-endian.
 */
export function encodeVoluntaryExitSSZ(msg: VoluntaryExitMessage): Uint8Array {
  const buf = new Uint8Array(16);
  const view = new DataView(buf.buffer);
  // epoch: bytes 0–7
  view.setBigUint64(0, BigInt(msg.epoch), /* littleEndian= */ true);
  // validator_index: bytes 8–15
  view.setBigUint64(8, BigInt(msg.validatorIndex), /* littleEndian= */ true);
  return buf;
}

/**
 * Converts a Uint8Array to a lowercase hex string (no 0x prefix).
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hex string (with or without 0x prefix) to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have an even length');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Computes a SHA-256 hash, returning a lowercase hex string.
 * Works in both browser (SubtleCrypto) and Node.js (for tests).
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const hashBuf = await window.crypto.subtle.digest('SHA-256', data as BufferSource);
    return bytesToHex(new Uint8Array(hashBuf));
  }
  // Node.js fallback (used in Vitest)
  const { createHash } = await import('crypto');
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Builds the unsigned exit message:
 *  - SSZ-encodes the VoluntaryExit struct
 *  - Returns the hex blob and its SHA-256 hash (for the audit log)
 */
export async function buildUnsignedExitMessage(msg: VoluntaryExitMessage): Promise<{
  /** SSZ-encoded bytes */
  sszBytes: Uint8Array;
  /** Lower-case hex of the SSZ bytes (no 0x prefix) */
  hexBlob: string;
  /** Lower-case SHA-256 hex of the SSZ bytes */
  messageHash: string;
}> {
  const sszBytes = encodeVoluntaryExitSSZ(msg);
  const hexBlob = bytesToHex(sszBytes);
  const messageHash = await sha256Hex(sszBytes);
  return { sszBytes, hexBlob, messageHash };
}

/**
 * Validates a signed exit blob.
 * A BLS signature is 96 bytes = 192 hex chars (no 0x prefix) or 194 with prefix.
 */
export function isValidSignatureHex(sig: string): boolean {
  const cleaned = sig.startsWith('0x') ? sig.slice(2) : sig;
  return /^[0-9a-fA-F]{192}$/.test(cleaned);
}

/**
 * Fetches the current epoch from the beacon node's genesis info.
 * Falls back to a locally-derived epoch when the node is unreachable.
 */
export async function fetchCurrentEpoch(beaconNodeUrl?: string): Promise<number> {
  const GENESIS_TIME = 1_606_824_023; // mainnet genesis unix-seconds
  const EPOCH_SECONDS = 32 * 12; // 32 slots × 12 s

  if (!beaconNodeUrl) {
    return Math.max(0, Math.floor((Date.now() / 1000 - GENESIS_TIME) / EPOCH_SECONDS));
  }

  const url = beaconNodeUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${url}/eth/v1/beacon/genesis`);
    if (!res.ok) throw new Error('genesis fetch failed');
    const body = (await res.json()) as { data?: { genesis_time?: string | number } };
    const genesisTime = Number(body.data?.genesis_time ?? GENESIS_TIME);
    return Math.max(0, Math.floor((Date.now() / 1000 - genesisTime) / EPOCH_SECONDS));
  } catch {
    return Math.max(0, Math.floor((Date.now() / 1000 - GENESIS_TIME) / EPOCH_SECONDS));
  }
}
