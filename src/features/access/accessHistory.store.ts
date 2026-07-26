import { create } from "zustand";
import type { AccessCheckResult } from "./useAccessCheck";

export const MAX_ACCESS_HISTORY_ENTRIES = 20;

export type AccessHistoryStatus = "granted" | "denied" | "error";

export type AccessHistoryEntry = {
  id: string;
  guildId: string;
  guildName?: string;
  resourceId: string;
  resourceName: string;
  status: AccessHistoryStatus;
  reason?: string;
  checkedAt: string;
  matchedRoles: string[];
  requiredRoles: string[];
};

type RecordCheckInput = {
  guildId: string;
  guildName?: string;
  resourceId: string;
  resourceName?: string;
  result?: AccessCheckResult;
  error?: unknown;
};

type AccessHistoryState = {
  entries: AccessHistoryEntry[];
  recordCheck: (input: RecordCheckInput) => void;
  clearHistory: () => void;
};

const safeErrorReason = () => "Access check failed. Please try again.";

const safeName = (value: string | undefined, fallback: string) => value?.trim() || fallback;
let entrySequence = 0;

export const useAccessHistoryStore = create<AccessHistoryState>((set, get) => ({
  entries: [],

  recordCheck: ({ guildId, guildName, resourceId, resourceName, result }) => {
    const checkedAt = new Date().toISOString();
    const status = result ? (result.hasAccess ? "granted" : "denied") : "error";

    const entry: AccessHistoryEntry = {
      id: `${checkedAt}:${guildId}:${resourceId}:${entrySequence}`,
      guildId,
      guildName: safeName(guildName, guildId),
      resourceId,
      resourceName: safeName(resourceName, resourceId),
      status,
      reason: status === "error" ? safeErrorReason() : result?.reason,
      checkedAt,
      matchedRoles: result?.matchedRoles ?? [],
      requiredRoles: result?.requiredRoles ?? [],
    };

    entrySequence += 1;

    const nextEntries = [entry, ...get().entries].slice(0, MAX_ACCESS_HISTORY_ENTRIES);
    set({ entries: nextEntries });
  },

  clearHistory: () => {
    set({ entries: [] });
  },
}));
