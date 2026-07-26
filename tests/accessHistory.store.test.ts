import { beforeEach, describe, expect, it } from "vitest";
import { ACCESS_GRANTED_FIXTURE } from "./fixtures/access.fixtures";
import {
  MAX_ACCESS_HISTORY_ENTRIES,
  useAccessHistoryStore,
} from "../src/features/access/accessHistory.store";

describe("access history store", () => {
  beforeEach(() => {
    useAccessHistoryStore.setState({ entries: [] });
  });

  it("records granted checks", () => {
    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-alpha",
      resourceId: "vip-door",
      resourceName: "VIP Door",
      result: ACCESS_GRANTED_FIXTURE,
    });

    const [entry] = useAccessHistoryStore.getState().entries;
    expect(entry).toMatchObject({
      guildId: "guild-alpha",
      resourceId: "vip-door",
      resourceName: "VIP Door",
      status: "granted",
      reason: ACCESS_GRANTED_FIXTURE.reason,
    });
  });

  it("records denied checks", () => {
    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-beta",
      resourceId: "members-room",
      result: {
        hasAccess: false,
        reason: "No access",
        matchedRoles: [],
        requiredRoles: ["Member"],
      },
    });

    const [entry] = useAccessHistoryStore.getState().entries;
    expect(entry).toMatchObject({
      guildId: "guild-beta",
      resourceId: "members-room",
      status: "denied",
      reason: "No access",
    });
  });

  it("records sanitized error checks", () => {
    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-alpha",
      resourceId: "vip-door",
      error: new Error("Authorization: Bearer secret-token"),
    });

    const [entry] = useAccessHistoryStore.getState().entries;

    expect(entry).toMatchObject({
      status: "error",
      reason: "Access check failed. Please try again.",
      matchedRoles: [],
      requiredRoles: [],
    });
    expect(JSON.stringify(entry)).not.toMatch(/secret-token/i);
    expect(JSON.stringify(entry)).not.toMatch(/authorization/i);
  });

  it("stores newest entries first", () => {
    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-alpha",
      resourceId: "first",
      result: { hasAccess: true, matchedRoles: [], requiredRoles: [] },
    });
    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-alpha",
      resourceId: "second",
      result: { hasAccess: false, matchedRoles: [], requiredRoles: [] },
    });

    const [firstEntry, secondEntry] = useAccessHistoryStore.getState().entries;
    expect(firstEntry.resourceId).toBe("second");
    expect(secondEntry.resourceId).toBe("first");
  });

  it("caps the list at the maximum number of entries", () => {
    for (let index = 0; index < MAX_ACCESS_HISTORY_ENTRIES + 1; index += 1) {
      useAccessHistoryStore.getState().recordCheck({
        guildId: `guild-${index}`,
        resourceId: `resource-${index}`,
        result: { hasAccess: true, matchedRoles: [], requiredRoles: [] },
      });
    }

    const entries = useAccessHistoryStore.getState().entries;
    expect(entries).toHaveLength(MAX_ACCESS_HISTORY_ENTRIES);
    expect(entries[0].resourceId).toBe(`resource-${MAX_ACCESS_HISTORY_ENTRIES}`);
    expect(entries.at(-1)?.resourceId).toBe(`resource-1`);
  });

  it("evicts the oldest entry when the 21st entry is added", () => {
    for (let index = 0; index < MAX_ACCESS_HISTORY_ENTRIES; index += 1) {
      useAccessHistoryStore.getState().recordCheck({
        guildId: `guild-${index}`,
        resourceId: `resource-${index}`,
        result: { hasAccess: true, matchedRoles: [], requiredRoles: [] },
      });
    }

    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-new",
      resourceId: "resource-new",
      result: { hasAccess: false, matchedRoles: [], requiredRoles: [] },
    });

    const entries = useAccessHistoryStore.getState().entries;
    expect(entries).toHaveLength(MAX_ACCESS_HISTORY_ENTRIES);
    expect(entries.some((entry) => entry.resourceId === "resource-0")).toBe(false);
    expect(entries[0].resourceId).toBe("resource-new");
  });

  it("clears the history list", () => {
    useAccessHistoryStore.getState().recordCheck({
      guildId: "guild-alpha",
      resourceId: "vip-door",
      result: ACCESS_GRANTED_FIXTURE,
    });

    useAccessHistoryStore.getState().clearHistory();

    expect(useAccessHistoryStore.getState().entries).toStrictEqual([]);
  });

  it("exposes no hydration or persistence API", () => {
    const state = useAccessHistoryStore.getState();

    expect(Object.keys(state).sort()).toStrictEqual(
      ["clearHistory", "entries", "recordCheck"].sort(),
    );
    expect(state).not.toHaveProperty("hydrate");
    expect(state).not.toHaveProperty("historyByWallet");
    expect(state).not.toHaveProperty("clearAllHistory");
  });
});
