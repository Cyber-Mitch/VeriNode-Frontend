/**
 * WalletSigner abstracts the signing operation across different
 * Stellar wallet extensions (Freighter, Lobstr, xBull, Albedo).
 *
 * Each implementation uses the wallet-specific API to sign a
 * challenge preimage (nonce + serverId) and return the signature
 * as a hex-encoded string.
 *
 * For wallets that only expose signTransaction (not signMessage),
 * the preimage is passed directly. The server is responsible for
 * reconstructing the expected signed payload and verifying the
 * Ed25519 signature against the public key. This avoids the
 * complexity of building Stellar XDR envelopes in the browser.
 */

export interface WalletSigner {
  /** Sign an arbitrary payload (challenge preimage) */
  sign(payload: string): Promise<string>;

  /** Retrieve the public key for the active wallet account */
  getPublicKey(): Promise<string>;

  /** Human-readable wallet name */
  readonly walletType: string;
}

// ── Freighter (stellarWeb3) ──────────────────────────────────────

export class FreighterSigner implements WalletSigner {
  readonly walletType = "freighter";

  getPublicKey(): Promise<string> {
    if (typeof window === "undefined" || !window.stellarWeb3) {
      return Promise.reject(new Error("Freighter wallet not available"));
    }
    return window.stellarWeb3.getPublicKey();
  }

  async sign(payload: string): Promise<string> {
    if (typeof window === "undefined" || !window.stellarWeb3) {
      throw new Error("Freighter wallet not available");
    }

    // Prefer signMessage when available (returns { signature: string })
    if (window.stellarWeb3.signMessage) {
      const result = await window.stellarWeb3.signMessage(payload);
      return result.signature;
    }

    // Fall back to signTransaction for older Freighter versions.
    // The payload is passed directly — the server handles verification.
    const result = await window.stellarWeb3.signTransaction(payload);
    return result.signedTx;
  }
}

// ── Lobstr (webln) ───────────────────────────────────────────────

export class LobstrSigner implements WalletSigner {
  readonly walletType = "lobstr";

  getPublicKey(): Promise<string> {
    if (typeof window === "undefined" || !window.webln) {
      return Promise.reject(new Error("Lobstr wallet not available"));
    }
    return window.webln.getPublicKey();
  }

  async sign(payload: string): Promise<string> {
    if (typeof window === "undefined" || !window.webln) {
      throw new Error("Lobstr wallet not available");
    }

    // Lobstr's signTransaction signs arbitrary preimage bytes
    return window.webln.signTransaction(payload);
  }
}

// ── xBull ────────────────────────────────────────────────────────

export class XBullSigner implements WalletSigner {
  readonly walletType = "xbull";

  getPublicKey(): Promise<string> {
    if (typeof window === "undefined" || !window.xbull) {
      return Promise.reject(new Error("xBull wallet not available"));
    }
    return window.xbull.getPublicKey();
  }

  async sign(payload: string): Promise<string> {
    if (typeof window === "undefined" || !window.xbull) {
      throw new Error("xBull wallet not available");
    }

    return window.xbull.signTransaction(payload);
  }
}

// ── Albedo ───────────────────────────────────────────────────────

export class AlbedoSigner implements WalletSigner {
  readonly walletType = "albedo";

  getPublicKey(): Promise<string> {
    if (typeof window === "undefined" || !window.albedo) {
      return Promise.reject(new Error("Albedo wallet not available"));
    }
    return window.albedo.getPublicKey();
  }

  async sign(payload: string): Promise<string> {
    if (typeof window === "undefined" || !window.albedo) {
      throw new Error("Albedo wallet not available");
    }

    return window.albedo.signTransaction(payload);
  }
}

// ── Signer factory ───────────────────────────────────────────────

export function detectWalletSigner(): WalletSigner | null {
  if (typeof window === "undefined") return null;

  if (window.stellarWeb3) return new FreighterSigner();
  if (window.webln) return new LobstrSigner();
  if (window.xbull) return new XBullSigner();
  if (window.albedo) return new AlbedoSigner();

  return null;
}
