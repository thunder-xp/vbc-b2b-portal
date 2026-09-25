import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve("src/modules/payments/actions.ts"), "utf8");

describe("MAIB admin action authorization", () => {
  it("allows Finance viewers to run the non-mutating OAuth diagnostic", () => {
    const diagnostic = actions.slice(
      actions.indexOf("export async function verifyMaibConnectivityAdminAction"),
      actions.indexOf("export type ControlledLivePaymentActionState"),
    );

    expect(diagnostic).toContain('requireAdminPermission("admin.finance.view")');
    expect(diagnostic).not.toContain('requireAdminPermission("admin.payments.refund")');
  });

  it("keeps refund mutation and reconciliation behind the sensitive payment permission", () => {
    const refundActions = actions.slice(actions.indexOf("export async function refundRetailPaymentAdminAction"));

    expect(refundActions.match(/requireAdminPermission\("admin\.payments\.refund"\)/g)).toHaveLength(2);
  });

  it("keeps the controlled production checkout Finance-only and fails closed if public checkout is enabled", () => {
    const controlled = actions.slice(
      actions.indexOf("export async function initiateControlledLivePaymentAdminAction"),
      actions.indexOf("export async function refundRetailPaymentAdminAction"),
    );

    expect(controlled).toContain('requireAdminPermission("admin.payments.refund")');
    expect(controlled).toContain('process.env.RETAIL_CHECKOUT_ENABLED === "true"');
    expect(controlled).toContain('configuration.apiOrigin !== "https://api.maibmerchants.md"');
    expect(controlled).toContain('configuration.callbackUrl !== "https://www.nsd.md/api/payments/maib/callback"');
  });
});
