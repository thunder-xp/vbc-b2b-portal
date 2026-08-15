import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260815115646_retail_checkout_pilot_sessions.sql"), "utf8");
const server = fs.readFileSync(path.join(process.cwd(), "src/modules/public-retail/retail-checkout-server.ts"), "utf8");
const actions = fs.readFileSync(path.join(process.cwd(), "src/modules/public-retail/actions/retail-checkout-pilot.actions.ts"), "utf8");
const checkoutActions = fs.readFileSync(path.join(process.cwd(), "src/modules/public-retail/actions/retail-checkout.actions.ts"), "utf8");
const cartPage = fs.readFileSync(path.join(process.cwd(), "app/cart/page.tsx"), "utf8");
const checkoutPage = fs.readFileSync(path.join(process.cwd(), "app/checkout/page.tsx"), "utf8");

describe("retail checkout pilot gate", () => {
  it("stores only opaque hashes with bounded expiry and append-only audit evidence", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("expires_at <= created_at + interval '4 hours'");
    expect(migration).toContain("protect_retail_checkout_pilot_session_events");
    expect(migration).toContain("retail_checkout_pilot_sessions_admin_read");
    expect(migration).toContain("validate_retail_checkout_pilot_session");
    expect(migration).toContain("revoked_at is null");
    expect(migration).toContain("expires_at > now()");
  });

  it("keeps session issuance admin-only and cookie server-authoritative", () => {
    expect(actions).toContain('requireAdminPermission("admin.retail_marketplace.manage")');
    expect(actions).toContain("randomBytes(32).toString(\"base64url\")");
    expect(actions).toContain("httpOnly: true");
    expect(actions).toContain('sameSite: "strict"');
    expect(actions).toContain('secure: process.env.NODE_ENV === "production"');
    expect(actions).not.toContain("localStorage");
    expect(server).toContain("validate(tokenHash)");
  });

  it("gates cart, checkout, offer creation, and order lock through the same runtime contract", () => {
    expect(cartPage).toContain("hasRetailCheckoutAccess()");
    expect(checkoutPage).toContain("await hasRetailCheckoutAccess()");
    expect(checkoutActions.match(/await hasRetailCheckoutAccess\(\)/g)).toHaveLength(2);
    expect(checkoutActions).not.toContain("isRetailCheckoutEnabled");
  });

  it("adds no database validation call for ordinary browsers without a pilot cookie", () => {
    expect(server.indexOf("if (!tokenHash) return false")).toBeLessThan(server.indexOf("pilotRepository.validate(tokenHash)"));
  });

  it("does not grant payment or provider privileges", () => {
    expect(actions).not.toContain("simulateRetailOrderPayment");
    expect(actions).not.toContain("respondInstallationOffer");
    expect(migration).not.toContain("admin.retail_payment");
  });
});
