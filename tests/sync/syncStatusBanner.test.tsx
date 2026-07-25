/**
 * SyncStatusBanner – user-visible sync status (Issue #225)
 *
 * The acceptance criterion is that a user can determine sync status. #108
 * shipped useSyncStatus() with no consumer, so the engine was invisible; this
 * verifies the banner reports syncing and failure states, stays out of the way
 * when idle, and offers a retry the coordinator will honour.
 */

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusBanner } from "../../src/components/SyncStatusBanner";
import { useSyncStore } from "../../src/features/sync/sync.store";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const requestSync = vi.fn();
vi.mock("../../src/features/sync/syncManager", () => ({
  getSyncCoordinator: () => ({ requestSync }),
}));

type Rendered = ReturnType<typeof TestRenderer.create>;

function renderBanner(): Rendered {
  let tree: Rendered | undefined;
  act(() => {
    tree = TestRenderer.create(<SyncStatusBanner />);
  });
  return tree as Rendered;
}

function textContent(tree: Rendered): string {
  return JSON.stringify(tree.toJSON());
}

type JsonNode = {
  props?: Record<string, unknown>;
  children?: (JsonNode | string)[] | null;
};

/**
 * Walks the rendered JSON rather than using tree.root.findAll — this repo's
 * react-test-renderer types do not declare the find* helpers on
 * ReactTestInstance, and other suites already carry type errors for that.
 */
function findByTestId(node: JsonNode | string | null, testID: string): JsonNode | null {
  if (!node || typeof node === "string") return null;
  if (node.props?.testID === testID) return node;
  for (const child of node.children ?? []) {
    const hit = findByTestId(child, testID);
    if (hit) return hit;
  }
  return null;
}

beforeEach(() => {
  requestSync.mockClear();
  useSyncStore.setState({
    status: "idle",
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncError: null,
  });
});

describe("SyncStatusBanner", () => {
  it("renders nothing while idle, so a healthy sync is not noise", () => {
    expect(renderBanner().toJSON()).toBeNull();
  });

  it("tells the user a sync is in progress", () => {
    act(() => {
      useSyncStore.setState({ status: "syncing" });
    });
    const output = textContent(renderBanner());

    expect(output).toContain("Syncing");
    // No retry affordance while a pass is already running.
    expect(output).not.toContain("sync-status-retry");
  });

  it("reports a failure with the engine's reason", () => {
    act(() => {
      useSyncStore.setState({
        status: "error",
        lastSyncError: "2 of 5 entities failed to sync",
      });
    });
    const output = textContent(renderBanner());

    expect(output).toContain("Sync failed");
    expect(output).toContain("2 of 5 entities failed to sync");
  });

  it("asks the coordinator for a manual pass when retry is pressed", () => {
    act(() => {
      useSyncStore.setState({ status: "error", lastSyncError: "boom" });
    });
    const tree = renderBanner();

    const retry = findByTestId(tree.toJSON() as JsonNode, "sync-status-retry");
    expect(retry).not.toBeNull();
    act(() => {
      (retry?.props?.onPress as () => void)();
    });

    // "manual" is the rate-limit-exempt reason: a user who taps retry must
    // get a pass rather than silence.
    expect(requestSync).toHaveBeenCalledWith("manual");
  });
});
