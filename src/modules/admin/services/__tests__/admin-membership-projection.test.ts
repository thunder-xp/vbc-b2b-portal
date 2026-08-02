import { describe, expect, it } from "vitest";

import { partitionAdminMemberships } from "../admin-membership-projection";
import type { AdminPartnerMembership } from "../../types";

function membership(
  companyName: string,
  status: string,
  overrides: Partial<AdminPartnerMembership> = {},
): AdminPartnerMembership {
  return {
    id: `${companyName}-${status}`,
    companyId: `${companyName}-id`,
    companyName,
    companyStatus: "active",
    roleCode: "partner_owner",
    status,
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    approvedAt: "2026-01-02T00:00:00Z",
    endedAt: status === "active" ? null : "2026-08-01T00:00:00Z",
    isDefault: status === "active",
    historyReason: null,
    relatedAuditEvent: null,
    ...overrides,
  };
}

describe("admin membership projection", () => {
  it("keeps one active membership in the current projection", () => {
    const result = partitionAdminMemberships([membership("NADZOR SRL", "active")]);
    expect(result.active.map((item) => item.companyName)).toEqual(["NADZOR SRL"]);
    expect(result.history).toEqual([]);
  });

  it("shows only NADZOR as current for the BEZEDEI IVAN repair fixture", () => {
    const result = partitionAdminMemberships([
      membership("Icont Bussines Center SRL", "revoked", { isDefault: false }),
      membership("NADZOR SRL", "active"),
    ]);
    expect(result.active.map((item) => item.companyName)).toEqual(["NADZOR SRL"]);
    expect(result.history.map((item) => item.companyName)).toEqual(["Icont Bussines Center SRL"]);
  });

  it("supports multiple active memberships", () => {
    const result = partitionAdminMemberships([
      membership("Company A", "active"),
      membership("Company B", "active", { isDefault: false }),
    ]);
    expect(result.active).toHaveLength(2);
    expect(result.history).toHaveLength(0);
  });

  it.each(["revoked", "suspended", "pending_approval", "rejected"])(
    "keeps %s membership in history only",
    (status) => {
      const result = partitionAdminMemberships([membership("Historical", status)]);
      expect(result.active).toHaveLength(0);
      expect(result.history[0]?.status).toBe(status);
    },
  );
});
