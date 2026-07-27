import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useUpdatePreferences,
  type CachedPreferences,
  type PreferencesPayload,
} from "../../src/features/settings/useUpdatePreferences";
import {
  buildSyncedPreferences,
  preferencesQueryKey,
} from "../../src/features/settings/preferencesCache";

type UpdatePreferencesMutation = ReturnType<typeof useUpdatePreferences>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderUpdatePreferencesHook(
  updatePreferences: (payload: PreferencesPayload) => Promise<CachedPreferences>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  let hookValue: UpdatePreferencesMutation | null = null;

  const HookHarness = () => {
    hookValue = useUpdatePreferences({ updatePreferences });
    return null;
  };

  TestRenderer.create(
    <QueryClientProvider client={queryClient}>
      <HookHarness />
    </QueryClientProvider>,
  );

  return {
    queryClient,
    get current() {
      if (!hookValue) {
        throw new Error("Hook did not render");
      }
      return hookValue;
    },
  };
}

describe("useUpdatePreferences optimistic cache updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the preferences cache immediately before the transport resolves", async () => {
    const request = deferred<CachedPreferences>();
    const transport = vi.fn(() => request.promise);
    const { current, queryClient } = renderUpdatePreferencesHook(transport);
    const previous = buildSyncedPreferences(undefined, {
      pushNotifications: false,
      emailNotifications: true,
    });
    const payload = {
      pushNotifications: true,
      emailNotifications: false,
    };

    queryClient.setQueryData(preferencesQueryKey, previous);

    act(() => {
      current.mutate(payload);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(transport.mock.calls[0][0]).toStrictEqual(payload);
    expect(queryClient.getQueryData(preferencesQueryKey)).toMatchObject({
      pushNotifications: true,
      emailNotifications: false,
      syncStatus: "pending",
    });

    const synced = buildSyncedPreferences(undefined, payload, 12345);
    await act(async () => {
      request.resolve(synced);
      await request.promise;
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(preferencesQueryKey)).toStrictEqual(synced);
  });

  it("rolls back to the previous preferences when the mutation fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("server rejected preferences");
    });
    const { current, queryClient } = renderUpdatePreferencesHook(transport);
    const previous = buildSyncedPreferences(undefined, {
      pushNotifications: false,
      emailNotifications: true,
    });

    queryClient.setQueryData(preferencesQueryKey, previous);

    await act(async () => {
      await expect(
        current.mutateAsync({
          pushNotifications: true,
          emailNotifications: false,
        }),
      ).rejects.toThrow("server rejected preferences");
    });

    expect(queryClient.getQueryData(preferencesQueryKey)).toStrictEqual(previous);
  });

  it("removes an optimistic-only preferences cache entry when creation fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("offline queue rejected preferences");
    });
    const { current, queryClient } = renderUpdatePreferencesHook(transport);

    await act(async () => {
      await expect(
        current.mutateAsync({
          pushNotifications: true,
          emailNotifications: true,
        }),
      ).rejects.toThrow("offline queue rejected preferences");
    });

    expect(queryClient.getQueryState(preferencesQueryKey)).toBeUndefined();
  });
});
