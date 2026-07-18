/**
 * SyncCorrectionNotice – visible correction UI (Issue #108)
 *
 * The acceptance criterion is that a corrected divergence surfaces a visible
 * notice rather than a silent overwrite; this verifies the banner renders the
 * correction messages and can be dismissed.
 */

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { SyncCorrectionNotice } from "../../src/components/SyncCorrectionNotice";
import type { SyncCorrection } from "../../src/features/sync/sync.types";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
}));

const REVOKED: SyncCorrection = {
  id: "membership_revoked:membership:guild_abc:0xabc",
  type: "membership_revoked",
  severity: "critical",
  entityKind: "membership",
  guildId: "guild_abc",
  walletAddress: "0xabc",
  message: 'Your membership in guild "guild_abc" is no longer active.',
  detectedAt: "2026-07-18T12:00:00.000Z",
};

const ROLES_ADDED: SyncCorrection = {
  id: "roles_added:user-roles:guild_abc:0xabc",
  type: "roles_added",
  severity: "info",
  entityKind: "user-roles",
  guildId: "guild_abc",
  walletAddress: "0xabc",
  message: 'New roles granted in guild "guild_abc": Contributor.',
  detectedAt: "2026-07-18T12:00:00.000Z",
};

describe("SyncCorrectionNotice", () => {
  it("renders nothing when there are no corrections", () => {
    const renderer = TestRenderer.create(
      <SyncCorrectionNotice corrections={[]} onDismiss={() => {}} />,
    );
    expect(renderer.toJSON()).toBeNull();
  });

  it("announces critical corrections as an alert with the correction message", () => {
    const renderer = TestRenderer.create(
      <SyncCorrectionNotice corrections={[REVOKED]} onDismiss={() => {}} />,
    );

    const alert = renderer.root.findByProps({ accessibilityRole: "alert" });
    expect(alert).toBeDefined();

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered).toContain("Your access has changed");
    expect(rendered).toContain("no longer active");
  });

  it("uses the informational title when no correction is critical", () => {
    const renderer = TestRenderer.create(
      <SyncCorrectionNotice corrections={[ROLES_ADDED]} onDismiss={() => {}} />,
    );

    expect(JSON.stringify(renderer.toJSON())).toContain("Your data was updated");
  });

  it("lists critical corrections before informational ones", () => {
    const renderer = TestRenderer.create(
      <SyncCorrectionNotice corrections={[ROLES_ADDED, REVOKED]} onDismiss={() => {}} />,
    );

    const rendered = JSON.stringify(renderer.toJSON());
    expect(rendered.indexOf("no longer active")).toBeLessThan(
      rendered.indexOf("New roles granted"),
    );
  });

  it("invokes onDismiss when the dismiss button is pressed", () => {
    const onDismiss = vi.fn();
    const renderer = TestRenderer.create(
      <SyncCorrectionNotice corrections={[REVOKED]} onDismiss={onDismiss} />,
    );

    const button = renderer.root.findByProps({
      accessibilityRole: "button",
      accessibilityLabel: "Dismiss sync corrections",
    });

    act(() => {
      button.props.onPress();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
