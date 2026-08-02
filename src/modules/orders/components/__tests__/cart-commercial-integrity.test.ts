import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("app/(partner)/cabinet/cart/page.tsx"), "utf8");
const action = readFileSync(resolve("src/modules/orders/actions/cart.actions.ts"), "utf8");
const recheckAction = action.slice(
  action.indexOf("export async function recheckCartCommercialDataAction"),
  action.indexOf("export async function getCartCheckoutIntentAction"),
);

describe("cart commercial integrity UX", () => {
  it("uses honest unresolved price and stock labels", () => {
    expect(page).toContain("Цена временно уточняется");
    expect(page).toContain("Наличие уточняется");
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
});
