'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WalletAccount, WalletProviderType } from '@/src/types/wallet';
import { clearAllCaches } from '@/src/lib/reactQuery';

interface WalletContextValue {
  activeAccount: WalletAccount | null;
  isConnected: boolean;
  pendingAccountSwitch: boolean;
  walletType: WalletProviderType | null;
  providers: Record<string, { isConnected: () => boolean }>;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletContextValue>({
  activeAccount: null,
  isConnected: false,
  pendingAccountSwitch: false,
  walletType: null,
  providers: {},
  connect: async () => {},
  disconnect: () => {},
});

interface WalletStore {
  activeAccount: WalletAccount | null;
  isConnected: boolean;
  pendingAccountSwitch: boolean;
  listeners: Set<() => void>;
}

let store: WalletStore = {
  activeAccount: null,
  isConnected: false,
  pendingAccountSwitch: false,
  listeners: new Set(),
};

function getSnapshot(): WalletAccount | null {
  return store.activeAccount;
}

function getServerSnapshot(): null {
  return null;
}

function subscribe(callback: () => void): () => void {
  store.listeners.add(callback);
  return () => {
    store.listeners.delete(callback);
  };
}

function emitChange() {
  store.listeners.forEach((listener) => listener());
}

function updateStore(partial: Partial<Pick<WalletStore, 'activeAccount' | 'isConnected' | 'pendingAccountSwitch'>>) {
  store = { ...store, ...partial };
  emitChange();
}

function getStellarPublicKey(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  if (window.stellarWeb3) {
    return window.stellarWeb3.getPublicKey().catch(() => null);
  }
  if (window.webln) {
    return window.webln.getPublicKey().catch(() => null);
  }
  if (window.albedo) {
    return window.albedo.getPublicKey().catch(() => null);
  }
  return Promise.resolve(null);
}

function detectProvider(): WalletProviderType | null {
  if (typeof window === 'undefined') return null;
  if (window.stellarWeb3) return 'freighter';
  if (window.webln) return 'lobstr';
  if (window.xbull) return 'xbull';
  if (window.albedo) return 'albedo';
  return null;
}

function captureBreadcrumb(previousKey: string | null, newKey: string | null, flushDuration: number, cacheEntriesInvalidated: number) {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.info('[WalletProvider] account switch:', { previousKey, newKey, flushDuration, cacheEntriesInvalidated });
  }
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const pendingSwitchRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousKeyRef = useRef<string | null>(null);
  const flushStartRef = useRef<number>(0);

  const activeAccount = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleAccountChange = useCallback(async (newPublicKey: string) => {
    const previousKey = previousKeyRef.current;
    if (newPublicKey === previousKey) return;

    flushStartRef.current = performance.now();
    pendingSwitchRef.current = true;
    updateStore({ pendingAccountSwitch: true });

    const { invalidated } = clearAllCaches(queryClient);

    const flushDuration = performance.now() - flushStartRef.current;

    updateStore({
      activeAccount: { publicKey: newPublicKey, provider: detectProvider() || 'freighter' },
      isConnected: true,
      pendingAccountSwitch: false,
    });

    previousKeyRef.current = newPublicKey;
    pendingSwitchRef.current = false;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wallet:accountFlushed', {
          detail: { previousKey, newKey: newPublicKey },
        })
      );
    }

    captureBreadcrumb(previousKey, newPublicKey, flushDuration, invalidated);
  }, [queryClient]);

  const debouncedAccountChange = useCallback((publicKey: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      handleAccountChange(publicKey);
    }, 300);
  }, [handleAccountChange]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const publicKey = detail?.publicKey;
      if (publicKey) {
        debouncedAccountChange(publicKey);
      }
    };

    window.addEventListener('stellar-wallet:accountChange', handler);
    return () => {
      window.removeEventListener('stellar-wallet:accountChange', handler);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [debouncedAccountChange]);

  useEffect(() => {
    getStellarPublicKey().then((publicKey) => {
      if (publicKey) {
        previousKeyRef.current = publicKey;
        updateStore({
          activeAccount: { publicKey, provider: detectProvider() || 'freighter' },
          isConnected: true,
          pendingAccountSwitch: false,
        });
      }
    });
  }, []);

  const connect = useCallback(async () => {
    const publicKey = await getStellarPublicKey();
    if (publicKey) {
      previousKeyRef.current = publicKey;
      const { invalidated } = clearAllCaches(queryClient);
      updateStore({
        activeAccount: { publicKey, provider: detectProvider() || 'freighter' },
        isConnected: true,
        pendingAccountSwitch: false,
      });
      captureBreadcrumb(null, publicKey, 0, invalidated);
    }
  }, [queryClient]);

  const disconnect = useCallback(() => {
    previousKeyRef.current = null;
    updateStore({
      activeAccount: null,
      isConnected: false,
      pendingAccountSwitch: false,
    });
  }, []);

  const walletType = detectProvider();

  const providers: Record<string, { isConnected: () => boolean }> = useMemo(() => {
    if (typeof window === "undefined") return {};
    return {
      ...(window.stellarWeb3 ? { freighter: { isConnected: () => true } } : {}),
      ...(window.lobstr ? { lobstr: { isConnected: () => true } } : {}),
      ...(window.xbull ? { xbull: { isConnected: () => true } } : {}),
      ...(window.albedo ? { albedo: { isConnected: () => true } } : {}),
    };
  }, []);

  const value = useMemo<WalletContextValue>(() => ({
    activeAccount,
    isConnected: store.isConnected,
    pendingAccountSwitch: store.pendingAccountSwitch,
    providers,
    walletType,
    connect,
    disconnect,
  }), [activeAccount, providers, walletType, connect, disconnect]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}
