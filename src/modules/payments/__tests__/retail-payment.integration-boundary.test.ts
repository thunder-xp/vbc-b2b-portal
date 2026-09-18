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

  it("keeps callback authoritative and browser return read-only in Phase 2", () => {
    const callback = readFileSync("app/api/payments/maib/callback/route.ts", "utf8");
    const returnPage = readFileSync("app/payment/return/page.tsx", "utf8");
    expect(callback).toContain("authenticateMaibCallback");
    expect(callback).toContain("confirmMaibCallback");
    expect(callback).toContain("new Response(null");
    expect(returnPage).toContain("getRetailPaymentReturnState");
    expect(returnPage).not.toContain("query.result");
    expect(returnPage).toContain("query.paymentAttemptId");
    expect(returnPage).toContain("paymentReturnCookieName");
    expect(returnPage).not.toContain("query.returnToken");
    expect(returnPage).toContain("Платёж обрабатывается");
    expect(returnPage).toContain("Оплата подтверждена");
    expect(returnPage).toContain("Plata este în curs de procesare");
    expect(returnPage).toContain("Plata a fost confirmată");
    expect(returnPage).toContain("state?.locale ?? publicRetailLocale(query.lang)");
  });

  it("does not introduce provider work on ordinary retail routes", () => {
    for (const file of ["app/page.tsx", "app/catalog/page.tsx", "app/products/[slug]/page.tsx", "app/cart/page.tsx"]) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("createRetailPaymentService");
      expect(content).not.toContain("MaibCheckoutV2Adapter");
    }
  });
});
