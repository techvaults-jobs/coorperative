import { describe, expect, it } from "vitest";
import { BRAND_PRESETS, checkBrandColor, contrastRatio, resolveTerminology, SECTOR_PROFILES, SECTORS } from "./configuration.js";

describe("configuration", () => {
  it("gives every sector words and modules", () => {
    for (const sector of SECTORS) {
      const p = SECTOR_PROFILES[sector];
      expect(p.terminology.externalId.length, sector).toBeGreaterThan(0);
      expect(p.modules.length, sector).toBeGreaterThan(0);
    }
  });

  it("merges a society's words over its sector defaults", () => {
    expect(resolveTerminology("agricultural", null)).toEqual({ externalId: "Farmer ID", group: "Farm cluster", contribution: "Contribution" });
    expect(resolveTerminology("workplace", { group: "  Faculty ", externalId: "", contribution: "x".repeat(41) })).toEqual({
      externalId: "Staff ID",
      group: "Faculty",
      contribution: "Monthly deduction",
    });
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("accepts only brand colours readable under white text", () => {
    expect(checkBrandColor(" #0D7A5F ")).toEqual({ ok: true, color: "#0d7a5f" });
    expect(checkBrandColor("#ffd400")).toMatchObject({ ok: false, reason: expect.stringContaining("too light") });
    expect(checkBrandColor("green")).toMatchObject({ ok: false, reason: expect.stringContaining("hex") });
    for (const p of BRAND_PRESETS) expect(checkBrandColor(p.color).ok, p.name).toBe(true);
  });
});
