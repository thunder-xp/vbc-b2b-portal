import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve("src/modules/payments/actions.ts"), "utf8");

describe("MAIB admin action authorization", () => {
  it("allows Finance viewers to run the non-mutating OAuth diagnostic", () => {
    const diagnostic = actions.slice(
      actions.indexOf("export async function verifyMaibConnectivityAdminAction"),
      actions.indexOf("export async function refundRetailPaymentAdminAction"),
    );

    expect(diagnostic).toContain('requireAdminPermission("admin.finance.view")');
    expect(diagnostic).not.toContain('requireAdminPermission("admin.payments.refund")');
  });

  it("keeps refund mutation and reconciliation behind the sensitive payment permission", () => {
    const refundActions = actions.slice(actions.indexOf("export async function refundRetailPaymentAdminAction"));

    expect(refundActions.match(/requireAdminPermission\("admin\.payments\.refund"\)/g)).toHaveLength(2);
  });
});
