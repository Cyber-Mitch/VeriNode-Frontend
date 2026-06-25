import QRCode from "qrcode";

export interface QRPayload {
  nodeId: string;
  serverEndpoint: string;
  setupToken: string;
  nonce: string;
}

const PAYLOAD_BYTE_LIMIT = 200;
const QR_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const QR_OPTIONS: QRCode.QRCodeToStringOptions = {
  type: "svg",
  errorCorrectionLevel: "M",
  width: 256,
  margin: 2,
};

/**
 * Estimate JSON payload size in bytes.
 */
function payloadByteSize(payload: QRPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/**
 * Validate that the payload fits within the QR v4 capacity (~200 bytes).
 */
function validatePayload(payload: QRPayload): void {
  const size = payloadByteSize(payload);
  if (size > PAYLOAD_BYTE_LIMIT) {
    throw new Error(
      `QR payload too large: ${size} bytes (max ${PAYLOAD_BYTE_LIMIT})`,
    );
  }
}

/**
 * Generate a cryptographically-random nonce (16 bytes hex).
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface QRGenerationResult {
  svg: string;
  dataUrl: string;
  expiresAt: number;
  nonce: string;
}

/**
 * Generate a QR code SVG + data URL for node pairing.
 * The QR auto-expires after 10 minutes.
 */
export async function generatePairingQR(
  payload: Omit<QRPayload, "nonce">,
): Promise<QRGenerationResult> {
  const nonce = generateNonce();
  const fullPayload: QRPayload = { ...payload, nonce };

  validatePayload(fullPayload);

  const json = JSON.stringify(fullPayload);
  const svg = await QRCode.toString(json, QR_OPTIONS);
  const dataUrl = await QRCode.toDataURL(json, {
    errorCorrectionLevel: "M",
    width: 256,
  });

  return {
    svg,
    dataUrl,
    expiresAt: Date.now() + QR_EXPIRY_MS,
    nonce,
  };
}

/**
 * Check if a QR code has expired.
 */
export function isQRExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

/**
 * Get remaining validity in seconds.
 */
export function qrRemainingSeconds(expiresAt: number): number {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}