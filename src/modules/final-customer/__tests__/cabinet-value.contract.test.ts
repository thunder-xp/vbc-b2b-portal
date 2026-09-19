import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Final Customer Cabinet value contract", () => {
  it("keeps five daily destinations primary and preserves contextual utility access", () => {
    const navigation = read("src/modules/final-customer/components/CustomerNavigation.tsx");
    for (const path of ["/account", "/account/orders", "/account/purchases", "/account/service", "/account/profile"]) {
      expect(navigation).toContain(path);
    }
    for (const path of ["/account/equipment", "/account/documents", "/account/security"]) expect(navigation).not.toContain(`href: "${path}"`);
    const home = read("app/account/(private)/page.tsx");
    expect(home).toContain('href="/account/documents"');
    expect(home).toContain('href="/account/equipment"');
    expect(navigation).not.toContain("/account/installations");
  });

  it("renders an intentional zero-history home instead of a zero metric grid", () => {
    const home = read("app/account/(private)/page.tsx");
    expect(home).toContain("CabinetEmptyState");
    expect(home).toContain("Добро пожаловать в NSD");
    expect(home).toContain("actions={hasActivity ?");
    expect(home).not.toContain("const cards =");
  });

  it("keeps the paused Installation Marketplace out of customer commerce journeys", () => {
    const order = read("app/account/(private)/orders/[orderId]/page.tsx");
    expect(order).not.toContain("getInstallationMarketplaceService");
    expect(order).not.toContain("/account/installations/new");
  });

  it("provides intentional empty states with catalog and service continuity", () => {
    const emptyState = read("src/modules/final-customer/components/CustomerEmptyState.tsx");
    expect(emptyState).toContain("/catalog?lang=${locale}&view=all");
    expect(emptyState).toContain("/account/service/new");
    for (const page of ["orders", "purchases", "documents"]) {
      expect(read(`app/account/(private)/${page}/page.tsx`)).toContain("CustomerEmptyState");
    }
    expect(read("app/account/(private)/equipment/page.tsx")).toContain('redirect("/account/purchases")');
  });

  it("links authoritative current products without exposing marketplace or provider state", () => {
    const purchases = read("app/account/(private)/purchases/page.tsx");
    const order = read("app/account/(private)/orders/[orderId]/page.tsx");
    expect(purchases).toContain("/products/${line.currentProduct.slug}?lang=${locale}");
    expect(order).toContain("/products/${line.currentProduct.slug}?lang=${locale}");
    expect(order).not.toContain("providerPaymentId");
  });

  it("uses factual SMS login copy and labels profile email as unverified", () => {
    const security = read("app/account/(private)/security/page.tsx");
    const copy = read("src/modules/final-customer/copy.ts");
    expect(security).toContain("copy.smsLogin");
    expect(security).not.toContain('context.aal ?? "aal1"');
    expect(copy).toContain("не считается проверенным");
    expect(copy).toContain("nu este considerat verificat");
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

  it("keeps purchases product-led and contextualizes documents and service", () => {
    const purchases = read("app/account/(private)/purchases/page.tsx");
    const detail = read("app/account/(private)/equipment/[lineId]/page.tsx");
    const documents = read("app/account/(private)/documents/page.tsx");
    expect(purchases).toContain("purchaseWorkspace");
    expect(purchases).toContain("line.currentProduct.price");
    expect(purchases).toContain("orderLineId=${line.id}");
    expect(detail).toContain("equipmentDetail");
    expect(detail).toContain("PublicRetailAddToCartButton");
    expect(documents).toContain("documentGroups");
    expect(documents).not.toContain("providerPaymentId");
  });

  it("keeps document metadata on the server-owned read boundary", () => {
    const repository = read("src/modules/final-customer/supabase.repository.ts");
    const migration = read("supabase/migrations/20260919153000_final_customer_product_document_service_read.sql");
    expect(repository).toContain('createAdminClient().from("catalog_product_documents")');
    expect(migration).toContain("grant select on table public.catalog_product_documents to service_role");
    expect(migration).not.toMatch(/to\s+(?:anon|authenticated)\b/i);
  });

  it("documents missing authoritative fulfillment, returns, serial, and warranty-expiry sources", () => {
    const architecture = read("docs/architecture/FINAL_CUSTOMER_CABINET.md");
    for (const phrase of ["never inferred", "Returns/refunds", "Serial and personal warranty expiry", "no live 1C request"]) expect(architecture).toContain(phrase);
  });
});
