import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { AccessCheckParams, AccessCheckResult } from "./useAccessCheck";

export const ACCESS_HISTORY_STORAGE_KEY = "guildpass:access-history:v1";
const MAX_HISTORY_PER_WALLET = 20;

export type AccessHistoryStatus = "granted" | "denied" | "error";

export type AccessHistoryEntry = {
  id: string;
  walletAddress: string;
  guildId: string;
  resourceId: string;
  status: AccessHistoryStatus;
  reason?: string;
  checkedAt: string;
  matchedRoles: string[];
  requiredRoles: string[];
};

type RecordCheckInput = AccessCheckParams & {
  result?: AccessCheckResult;
  error?: unknown;
};

type AccessHistoryState = {
  historyByWallet: Record<string, AccessHistoryEntry[]>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  recordCheck: (input: RecordCheckInput) => Promise<void>;
  clearWalletHistory: (walletAddress: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  getHistoryForWallet: (walletAddress: string | null | undefined) => AccessHistoryEntry[];
  lastDecodedPayload: Record<string, any> | null;
  setLastDecodedPayload: (payload: Record<string, any> | null) => void;
};

const walletKey = (walletAddress: string | null | undefined) =>
  walletAddress?.trim().toLowerCase() ?? "";

const hasHistory = (historyByWallet: Record<string, AccessHistoryEntry[]>) =>
  Object.values(historyByWallet).some((entries) => entries.length > 0);

const persistHistory = async (historyByWallet: Record<string, AccessHistoryEntry[]>) => {
  if (!hasHistory(historyByWallet)) {
    await AsyncStorage.removeItem(ACCESS_HISTORY_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(ACCESS_HISTORY_STORAGE_KEY, JSON.stringify(historyByWallet));
};

const safeErrorReason = () => "Access check failed. Please try again.";

export const useAccessHistoryStore = create<AccessHistoryState>((set, get) => ({
  historyByWallet: {},
  hydrated: false,
  lastDecodedPayload: null,
  setLastDecodedPayload: (payload) => set({ lastDecodedPayload: payload }),

  hydrate: async () => {
    const rawHistory = await AsyncStorage.getItem(ACCESS_HISTORY_STORAGE_KEY);

    if (!rawHistory) {
      set({ historyByWallet: {}, hydrated: true });
      return;
    }

    try {
      const parsed = JSON.parse(rawHistory) as Record<string, AccessHistoryEntry[]>;
      set({ historyByWallet: parsed, hydrated: true });
    } catch {
      await AsyncStorage.removeItem(ACCESS_HISTORY_STORAGE_KEY);
      set({ historyByWallet: {}, hydrated: true });
    }
  },

  recordCheck: async ({ walletAddress, guildId, resourceId, result, error }) => {
    const key = walletKey(walletAddress);
    if (!key) {
      return;
    }

    const checkedAt = new Date().toISOString();
    const entry: AccessHistoryEntry = {
      id: `${checkedAt}:${key}:${guildId}:${resourceId}`,
      walletAddress: key,
      guildId,
      resourceId,
      status: result ? (result.hasAccess ? "granted" : "denied") : "error",
      reason: result?.reason ?? (error ? safeErrorReason() : undefined),
      checkedAt,
      matchedRoles: result?.matchedRoles ?? [],
      requiredRoles: result?.requiredRoles ?? [],
    };

    const current = get().historyByWallet;
    const nextForWallet = [entry, ...(current[key] ?? [])].slice(0, MAX_HISTORY_PER_WALLET);
    const next = {
      ...current,
      [key]: nextForWallet,
    };

    set({ historyByWallet: next, hydrated: true });
    await persistHistory(next);
  },

  clearWalletHistory: async (walletAddress) => {
    const key = walletKey(walletAddress);
    if (!key) {
      return;
    }

    const next = { ...get().historyByWallet };
    delete next[key];

    set({ historyByWallet: next, hydrated: true });
    await persistHistory(next);
  },

  clearAllHistory: async () => {
    set({ historyByWallet: {}, hydrated: true });
    await AsyncStorage.removeItem(ACCESS_HISTORY_STORAGE_KEY);
  },

  getHistoryForWallet: (walletAddress) => {
    const key = walletKey(walletAddress);
    if (!key) {
      return [];
    }

    return get().historyByWallet[key] ?? [];
  },
}));
