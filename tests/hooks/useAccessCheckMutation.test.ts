import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_CHECK_PARAMS, ACCESS_GRANTED_FIXTURE } from "../fixtures/access.fixtures";
import { useAccessCheck } from "../../src/features/access/useAccessCheck";

const guildPassClientMock = vi.hoisted(() => ({
  checkAccess: vi.fn(),
}));

vi.mock("../../src/lib/guildpassClient", () => ({
  guildPassClient: {
    access: {
      checkAccess: guildPassClientMock.checkAccess,
    },
  },
}));

type AccessCheckMutation = ReturnType<typeof useAccessCheck>;

function renderAccessCheckHook() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  let hookValue: AccessCheckMutation | null = null;

  const HookHarness = () => {
    hookValue = useAccessCheck();
    return null;
  };

  TestRenderer.create(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(HookHarness),
    ),
  );

  return {
    get current() {
      if (!hookValue) {
        throw new Error("Hook did not render");
      }
      return hookValue;
    },
  };
}

describe("useAccessCheck mutation flow", () => {
  beforeEach(() => {
    guildPassClientMock.checkAccess.mockReset().mockResolvedValue(ACCESS_GRANTED_FIXTURE);
  });

  it("does not call checkAccess until the caller explicitly submits params", () => {
    renderAccessCheckHook();

    expect(guildPassClientMock.checkAccess).not.toHaveBeenCalled();
  });

  it("runs submitted params through a mutation and exposes the result", async () => {
    const result = renderAccessCheckHook();
    let res: any;

    await act(async () => {
      res = await result.current.mutateAsync(ACCESS_CHECK_PARAMS);
    });

    expect(res).toStrictEqual(ACCESS_GRANTED_FIXTURE);
    expect(guildPassClientMock.checkAccess).toHaveBeenCalledTimes(1);
    expect(guildPassClientMock.checkAccess).toHaveBeenCalledWith(ACCESS_CHECK_PARAMS);
  });

  it("uses the access-check mutation key", async () => {
    const queryClient = new QueryClient();
    let mutation: ReturnType<typeof useAccessCheck> | null = null;

    const HookHarness = () => {
      mutation = useAccessCheck();
      return null;
    };

    act(() => {
      TestRenderer.create(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HookHarness),
        ),
      );
    });

    const renderedMutation = mutation as NonNullable<ReturnType<typeof useAccessCheck>> | null;

    if (!renderedMutation) {
      throw new Error("Hook did not render");
    }

    await act(async () => {
      await renderedMutation.mutateAsync(ACCESS_CHECK_PARAMS);
    });

    expect(queryClient.getMutationCache().getAll()[0]?.options.mutationKey).toStrictEqual([
      "access-check",
    ]);
  });
});
