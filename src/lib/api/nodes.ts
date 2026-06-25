const BASE = "/api/v1/nodes";

export interface NodeProvisionRequest {
  nodeId: string;
  serverEndpoint: string;
  setupToken: string;
  nonce: string;
}

export interface NodeProvisionResponse {
  ok: boolean;
  nodeId: string;
  provisionedAt: number;
}

export async function registerNode(
  payload: NodeProvisionRequest,
): Promise<NodeProvisionResponse> {
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      (body as { message?: string }).message ??
        `Node registration failed: ${res.status}`,
    );
  }

  return res.json();
}