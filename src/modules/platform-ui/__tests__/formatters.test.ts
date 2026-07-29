import { describe, expect, it } from "vitest";

import {
  formatBusinessAmount,
  formatBusinessDate,
  formatBusinessDateTime,
  formatBusinessQuantity,
  getPartnerRoleDescription,
  getPartnerRoleLabel,
} from "..";

describe("platform business formatting", () => {
  it("formats dates, amounts, and quantities consistently", () => {
    expect(formatBusinessDate("2026-07-29T10:15:00Z")).toMatch(/29.*2026/);
    expect(formatBusinessDateTime("2026-07-29T10:15:00Z")).toMatch(/29.*2026/);
    expect(formatBusinessAmount("2399", "MDL")).toBe("2 399 MDL");
    expect(formatBusinessQuantity(12.5)).toBe("12,5 шт.");
  });

  it("returns a safe placeholder for invalid values", () => {
    expect(formatBusinessDate("invalid")).toBe("—");
    expect(formatBusinessAmount("invalid", "USD")).toBe("—");
  });

  it("translates role codes without exposing unknown internal codes", () => {
    expect(getPartnerRoleLabel("partner_owner")).toBe("Владелец");
    expect(getPartnerRoleDescription("partner_buyer")).toContain("корзина");
    expect(getPartnerRoleLabel("internal_code")).toBe("Роль уточняется");
  });
});
