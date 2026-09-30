import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("app/(partner)/cabinet/cart/page.tsx"), "utf8");
const cartService = readFileSync(resolve("src/modules/orders/services/cart.service.ts"), "utf8");
const pricingPanel = readFileSync(resolve("src/modules/orders/components/CartPricingPanel.tsx"), "utf8");
const action = readFileSync(resolve("src/modules/orders/actions/cart.actions.ts"), "utf8");
const orderAction = readFileSync(resolve("src/modules/orders/actions/order.actions.ts"), "utf8");
const recheckAction = action.slice(
  action.indexOf("export async function recheckCartCommercialDataAction"),
  action.indexOf("export async function getCartCheckoutIntentAction"),
);

describe("cart commercial integrity UX", () => {
  it("keeps honest unresolved pricing while removing redundant item stock copy", () => {
    expect(pricingPanel).toContain("props.copy.pricePending");
    expect(page).not.toContain("copy.stockPending");
    expect(page).not.toContain("copy.inStock");
    expect(page).not.toContain("copy.outOfStock");
    expect(page).not.toContain("copy.availableOfRequested");
    expect(page).not.toMatch(/availableStock\s*\?\?\s*0/);
    expect(cartService).toContain("availableStock: catalogVisible ? view?.stock?.exactAvailableQuantity ?? null : 0");
    expect(cartService).toContain("availabilityGroup: catalogVisible ? resolveAvailabilityGroup(view) : \"confirmation\"");
  });

  it("rechecks one batched local cart projection without inline 1C access", () => {
    expect(recheckAction).toContain("recheckCartCommercialDataAction");
    expect(recheckAction).toContain("createCartService().getCart");
    expect(recheckAction).toContain('revalidatePath("/cabinet/cart")');
    expect(recheckAction).not.toMatch(/OneC|ONEC|fetch\(/);
  });

  it("removes the manual commercial recheck control without deleting its server capability", () => {
    expect(page).not.toContain("CartCommercialRecheck");
    expect(recheckAction).toContain("recheckCartCommercialDataAction");
  });

  it("preserves the cart while unresolved values await background sync", () => {
    expect(recheckAction).toContain("корзина сохранена");
    expect(recheckAction).not.toMatch(/delete|clearCart|removeItem/);
  });

  it("keeps retail-only checkout explanatory without exposing partner totals", () => {
    expect(page).toContain("commercialMode === \"retail_only\"");
    expect(page).toContain("copy.retailOnlyNote");
    expect(page).toContain("cart.retailReferenceTotal");
  });

  it("keeps one canonical kit persistence action", () => {
    expect(pricingPanel).toContain("[&_button]:min-h-11");
    expect(pricingPanel).toContain("[&_button]:w-full");
    expect(pricingPanel).toContain("<SaveAsPurchasingListButton label={props.locale === \"ro\" ? \"Salvează setul\" : \"Сохранить комплект\"} source=\"cart\" />");
    expect(pricingPanel).not.toContain("SaveAsPurchaseTemplateButton");
  });

  it("uses concise persistence labels and omits the visible checkout heading", () => {
    expect(page).not.toContain("<h2 className=\"font-semibold text-zinc-950\">{copy.checkoutReview}</h2>");
  });

  it("returns a price-free receipt from the checkout server action", () => {
    const submitAction = orderAction.slice(
      orderAction.indexOf("export async function submitCartOrderAction"),
      orderAction.indexOf("export type PartnerOrderSubmissionReceipt"),
    );
    expect(submitAction).toContain("external1cNumber: order.external1cNumber");
    expect(submitAction).not.toMatch(/partnerUnitPrice|documentTotal|currencyCode|payloadSnapshot/);
  });
});
