import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("app/(partner)/cabinet/cart/page.tsx"), "utf8");
const action = readFileSync(resolve("src/modules/orders/actions/cart.actions.ts"), "utf8");
const orderAction = readFileSync(resolve("src/modules/orders/actions/order.actions.ts"), "utf8");
const recheckAction = action.slice(
  action.indexOf("export async function recheckCartCommercialDataAction"),
  action.indexOf("export async function getCartCheckoutIntentAction"),
);

describe("cart commercial integrity UX", () => {
  it("uses honest unresolved price and stock labels", () => {
    expect(page).toContain("copy.pricePending");
    expect(page).toContain("copy.stockPending");
    expect(page).not.toMatch(/availableStock\s*\?\?\s*0/);
  });

  it("rechecks one batched local cart projection without inline 1C access", () => {
    expect(recheckAction).toContain("recheckCartCommercialDataAction");
    expect(recheckAction).toContain("createCartService().getCart");
    expect(recheckAction).toContain('revalidatePath("/cabinet/cart")');
    expect(recheckAction).not.toMatch(/OneC|ONEC|fetch\(/);
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

  it("aligns the two cart persistence actions as one responsive group", () => {
    expect(page).toContain("[&>button]:h-11");
    expect(page).toContain("[&>button]:w-full");
    expect(page).toContain("<SaveAsPurchasingListButton source=\"cart\" />");
    expect(page).toContain("<SaveAsPurchaseTemplateButton source={{ type: \"cart\" }} />");
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
