/**
 * SSZ serialization utilities for Ethereum consensus-layer types.
 *
 * This module re-exports the core SSZ encoding primitives used throughout the
 * voluntary-exit workflow so that callers have a single, stable import path
 * for consensus serialization helpers.
 *
 * All SSZ encoding for voluntary exits follows the Ethereum Phase-0 spec:
 *   https://github.com/ethereum/consensus-specs/blob/dev/specs/phase0/beacon-chain.md
 *
 * VoluntaryExit SSZ layout (16 bytes, little-endian uint64 fields):
 *   epoch          : uint64  (bytes 0–7)
 *   validator_index: uint64  (bytes 8–15)
 */

export {
  encodeVoluntaryExitSSZ,
  bytesToHex,
  hexToBytes,
  sha256Hex,
  buildUnsignedExitMessage,
  isValidSignatureHex,
  fetchCurrentEpoch,
  getVoluntaryExitDomain,
  DOMAIN_VOLUNTARY_EXIT,
  QR_MAX_PAYLOAD_BYTES,
} from './exitMessageBuilder';

export type { VoluntaryExitMessage } from './exitMessageBuilder';
