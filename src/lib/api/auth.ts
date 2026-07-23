const BASE = "/api/v1/auth";

export interface AuthChallengeResponse {
  nonce: string;
  serverId: string;
  expiresAt: number; // epoch ms
}

export interface AuthVerifyRequest {
  nonce: string;
  publicKey: string;
  signature: string;
}

export interface AuthVerifyResponse {
  token: string;
  expiresAt: number;
}

export interface AuthSessionResponse {
  valid: boolean;
  expiresAt: number;
}

export async function getChallenge(): Promise<AuthChallengeResponse> {
  const res = await fetch(`${BASE}/challenge`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? `Challenge request failed: ${res.status}`);
  }

  return res.json();
}

export async function verify(
  payload: AuthVerifyRequest
): Promise<AuthVerifyResponse> {
  const res = await fetch(`${BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? `Verification failed: ${res.status}`);
  }

  return res.json();
}

export async function checkSession(): Promise<AuthSessionResponse> {
  const res = await fetch(`${BASE}/session`, {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) return { valid: false, expiresAt: 0 };
  return res.json();
}

export async function logoutRequest(): Promise<void> {
  const res = await fetch(`${BASE}/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? `Logout failed: ${res.status}`);
  }
}
