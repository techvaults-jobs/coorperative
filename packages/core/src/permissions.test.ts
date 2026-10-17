import { describe, expect, it } from "vitest";
import { can, canApprove, platformStaffCanRead } from "./permissions.js";

describe("permissions", () => {
  it("separates preparing from approving ledger entries", () => {
    expect(can(["treasurer"], "ledger.prepare")).toBe(true);
    expect(can(["treasurer"], "ledger.approve")).toBe(false);
    expect(can(["chairperson"], "ledger.approve")).toBe(true);
  });

  it("gives auditors read-only access", () => {
    expect(can(["auditor"], "ledger.read")).toBe(true);
    expect(can(["auditor"], "audit.read")).toBe(true);
    expect(can(["auditor"], "ledger.post")).toBe(false);
    expect(can(["auditor"], "members.write")).toBe(false);
  });

  it("forbids approving your own work even with the permission", () => {
    const result = canApprove(
      { userId: "u1", roles: ["treasurer", "chairperson"] },
      { preparedBy: "u1" },
      "ledger.approve",
    );
    expect(result).toEqual({ allowed: false, reason: "The person who prepared this cannot also approve it" });
    expect(canApprove({ userId: "u2", roles: ["chairperson"] }, { preparedBy: "u1" }, "ledger.approve")).toEqual({
      allowed: true,
    });
  });

  it("limits platform staff to unexpired, society-specific grants", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const grant = { societyId: "soc_1", grantedBy: "u_chair", expiresAt: "2026-10-17T14:00:00Z", scope: "read" as const };
    expect(platformStaffCanRead(undefined, "soc_1", now)).toBe(false);
    expect(platformStaffCanRead(grant, "soc_1", now)).toBe(true);
    expect(platformStaffCanRead(grant, "soc_2", now)).toBe(false);
    expect(platformStaffCanRead(grant, "soc_1", new Date("2026-10-17T15:00:00Z"))).toBe(false);
  });
});
