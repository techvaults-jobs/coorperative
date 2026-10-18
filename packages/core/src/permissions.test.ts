import { describe, expect, it } from "vitest";
import { can, canApprove, OFFICER_ROLES, platformStaffCanRead, ROLES } from "./permissions.js";

describe("permissions", () => {
  it("separates preparing from approving ledger entries", () => {
    expect(can(["treasurer"], "ledger.prepare")).toBe(true);
    expect(can(["treasurer"], "ledger.approve")).toBe(false);
    expect(can(["chairperson"], "ledger.approve")).toBe(true);
  });

  it("lets no role post to the journal without a second officer", () => {
    for (const role of ROLES) {
      if (can([role], "ledger.prepare") || can([role], "ledger.reverse")) expect(can([role], "ledger.approve"), role).toBe(false);
    }
  });

  it("treats every role except member as an officer role", () => {
    expect(OFFICER_ROLES).not.toContain("member");
    expect(OFFICER_ROLES).toHaveLength(ROLES.length - 1);
    expect(can(["secretary"], "officers.manage")).toBe(true);
    expect(can(["treasurer"], "officers.manage")).toBe(false);
  });

  it("gives auditors read-only access", () => {
    expect(can(["auditor"], "ledger.read")).toBe(true);
    expect(can(["auditor"], "audit.read")).toBe(true);
    expect(can(["auditor"], "ledger.prepare")).toBe(false);
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

describe("sensitive role grants", () => {
  it("treats approving and officer-managing roles as sensitive", async () => {
    const { SENSITIVE_ROLES, isSensitiveGrant } = await import("./permissions.js");
    expect([...SENSITIVE_ROLES].sort()).toEqual(["chairperson", "loan_committee", "principal_officer", "secretary"]);
    expect(isSensitiveGrant(["treasurer", "auditor"])).toBe(false);
    expect(isSensitiveGrant(["chairperson"])).toBe(true);
    expect(isSensitiveGrant(["chairperson", "auditor"], ["chairperson"])).toBe(false); // keeping a role isn't a new grant
  });
});
