import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Final Customer Cabinet value contract", () => {
  it("ships every functional navigation destination", () => {
    const navigation = read("src/modules/final-customer/components/CustomerNavigation.tsx");
    for (const path of ["/account/orders", "/account/purchases", "/account/equipment", "/account/documents", "/account/service", "/account/profile", "/account/security"]) {
      expect(navigation).toContain(path);
    }
  });

  it("server-governs authenticated checkout identity while preserving guest input", () => {
    const action = read("src/modules/public-retail/actions/retail-checkout.actions.ts");
    expect(action).toContain("getFinalCustomerContext().catch(() => null)");
    expect(action).toContain("phone: customerContext.verifiedPhone");
    expect(action).toContain(": input;");
  });

  it("uses existing public cart action for buy again", () => {
    const page = read("app/account/(private)/purchases/page.tsx");
    expect(page).toContain("PublicRetailAddToCartButton");
    expect(page).toContain("buyAgainAllowed");
    expect(page).not.toContain("supabase");
  });

  it("documents missing authoritative fulfillment, returns, serial, and warranty-expiry sources", () => {
    const architecture = read("docs/architecture/FINAL_CUSTOMER_CABINET.md");
    for (const phrase of ["never inferred", "Returns/refunds", "Serial and personal warranty expiry", "no live 1C request"]) expect(architecture).toContain(phrase);
  });
});
