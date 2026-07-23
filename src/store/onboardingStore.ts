import { create } from "zustand";

export type OnboardingStep =
  | "idle"
  | "generate-pairing"
  | "verify-connection"
  | "complete";

export interface NodeConfig {
  nodeId: string;
  serverEndpoint: string;
}

interface OnboardingState {
  step: OnboardingStep;
  nodeConfig: NodeConfig | null;
  setupToken: string | null;
  nonce: string | null;
  qrDataUrl: string | null;
  qrExpiresAt: number | null;
  isConnecting: boolean;
  connectionError: string | null;

  setStep: (step: OnboardingStep) => void;
  setNodeConfig: (config: NodeConfig) => void;
  setPairing: (
    setupToken: string,
    nonce: string,
    qrDataUrl: string,
    expiresAt: number,
  ) => void;
  setConnecting: (isConnecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: "idle" as const,
  nodeConfig: null,
  setupToken: null,
  nonce: null,
  qrDataUrl: null,
  qrExpiresAt: null,
  isConnecting: false,
  connectionError: null,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step, connectionError: null }),

  setNodeConfig: (config) => set({ nodeConfig: config }),

  setPairing: (setupToken, nonce, qrDataUrl, expiresAt) =>
    set({ setupToken, nonce, qrDataUrl, qrExpiresAt: expiresAt }),

  setConnecting: (isConnecting) => set({ isConnecting }),

  setConnectionError: (error) => set({ connectionError: error }),

  reset: () => set(initialState),
}));