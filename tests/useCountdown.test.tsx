import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCountdown } from "../src/features/access/useCountdown";

type CountdownSnapshot = ReturnType<typeof useCountdown>;

const CountdownHarness = ({
  expiresAt,
  onRender,
}: {
  expiresAt?: string;
  onRender: (countdown: CountdownSnapshot) => void;
}) => {
  onRender(useCountdown(expiresAt));
  return null;
};

describe("useCountdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks once per second, expires at zero, and stops its timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
    const snapshots: CountdownSnapshot[] = [];
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <CountdownHarness
          expiresAt="2026-07-21T12:00:03.000Z"
          onRender={(countdown) => snapshots.push(countdown)}
        />,
      );
    });

    expect(snapshots.at(-1)).toMatchObject({
      remainingSeconds: 3,
      label: "Expires in 3s",
      isExpired: false,
      isExpiringSoon: true,
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(snapshots.at(-1)?.remainingSeconds).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(snapshots.at(-1)?.remainingSeconds).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(snapshots.at(-1)).toMatchObject({
      remainingSeconds: 0,
      label: "Expired",
      isExpired: true,
      isExpiringSoon: false,
    });
    expect(vi.getTimerCount()).toBe(0);

    const renderCountAtExpiration = snapshots.length;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(snapshots).toHaveLength(renderCountAtExpiration);

    act(() => renderer!.unmount());
  });

  it("does not start a timer when no expiration is provided", () => {
    vi.useFakeTimers();
    let snapshot: CountdownSnapshot | undefined;
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <CountdownHarness onRender={(countdown) => (snapshot = countdown)} />,
      );
    });

    expect(snapshot).toEqual({
      remainingSeconds: null,
      label: null,
      isExpired: false,
      isExpiringSoon: false,
    });
    expect(vi.getTimerCount()).toBe(0);

    act(() => renderer!.unmount());
  });
});
