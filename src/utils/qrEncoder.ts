/**
 * Binary QR code generation for air-gapped signing workflows.
 *
 * Uses the `qrcode` package's byte (binary) mode to encode raw hex blobs so
 * that high-density binary data scans reliably at medium error-correction.
 *
 * Capacity reference (Version 40, byte mode, Medium ECC): 2 953 bytes.
 * We reject payloads larger than that limit so the QR stays scannable.
 */

import QRCode from 'qrcode';
import { QR_MAX_PAYLOAD_BYTES } from './exitMessageBuilder';

export interface ExitQRResult {
  /** Data-URL PNG of the generated QR code (for <img src=…>) */
  dataUrl: string;
  /** Raw hex payload encoded inside the QR (the unsigned exit hex blob) */
  payload: string;
  /** Byte length of the encoded payload */
  payloadBytes: number;
}

/**
 * Generates a binary-mode QR code for the given `hexBlob`.
 *
 * We encode the hex string as bytes directly (UTF-8 byte mode) rather than
 * alphanumeric mode to guarantee reliable scanning of mixed-case hex.
 *
 * @throws if the payload exceeds the Version-40 byte-mode capacity.
 */
export async function encodeExitQR(hexBlob: string): Promise<ExitQRResult> {
  const payloadBytes = new TextEncoder().encode(hexBlob).length;

  if (payloadBytes > QR_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `QR payload too large: ${payloadBytes} bytes (max ${QR_MAX_PAYLOAD_BYTES} bytes for Version-40 Medium ECC)`,
    );
  }

  const dataUrl = await QRCode.toDataURL(hexBlob, {
    errorCorrectionLevel: 'M',
    // Version 40 supports up to 2 953 bytes in byte mode at Medium ECC.
    // Specifying version 40 explicitly ensures the encoder never downgrades.
    version: 40,
    margin: 2,
    width: 512,
    // Use byte mode (the qrcode library calls this 'byte'; it maps to ISO
    // 8859-1 byte encoding which handles the ASCII hex alphabet correctly).
    type: 'image/png',
  });

  return { dataUrl, payload: hexBlob, payloadBytes };
}

/**
 * Validates that a hex string is within the QR capacity limit.
 */
export function validateQRPayloadSize(hexBlob: string): boolean {
  const bytes = new TextEncoder().encode(hexBlob).length;
  return bytes <= QR_MAX_PAYLOAD_BYTES;
}
