import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("retail payment public integration boundary", () => {
  it("accepts no browser amount, currency, or redirect URL", () => {
    const action = readFileSync("src/modules/public-retail/actions/retail-payment.actions.ts", "utf8");
    expect(action).toContain("orderToken: string; idempotencyKey: string");
    expect(action).not.toMatch(/input\.(amount|currency|callbackUrl|successUrl|failUrl)/);
    expect(action).toContain("hasRetailCheckoutAccess()");
    expect(action).toContain("hashRetailOrderAccessToken");
  });

  it("keeps callback and browser return paths side-effect free in Phase 1", () => {
    const callback = readFileSync("app/api/payments/maib/callback/route.ts", "utf8");
    const returnPage = readFileSync("app/payment/return/page.tsx", "utf8");
    expect(callback).toContain("payment_confirmation_not_enabled");
    expect(callback).not.toContain("activate_paid_retail_order");
    expect(returnPage).toContain("не подтверждает оплату");
  });

  it("does not introduce provider work on ordinary retail routes", () => {
    for (const file of ["app/page.tsx", "app/catalog/page.tsx", "app/products/[slug]/page.tsx", "app/cart/page.tsx"]) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("createRetailPaymentService");
      expect(content).not.toContain("MaibCheckoutV2Adapter");
    }
  });
});
