import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Final Customer object workspace V2 contract", () => {
  it("keeps grouping server-side and driven by stable catalog taxonomy identifiers", () => {
    const service = read("src/modules/final-customer/service.ts");
    expect(service).toContain("CUSTOMER_SYSTEM_CATEGORY_IDS");
    expect(service).toContain('CCTV: "4ece32e5-bccd-42a3-8a55-038e53b40353"');
    expect(service).toContain("buildCustomerObjectWorkspaceDetail");
    expect(service).not.toMatch(/installed|commissioned|warranty/i);
  });

  it("renders factual workspace sections and product-level service continuity", () => {
    const page = read("app/account/(private)/objects/[objectId]/page.tsx");
    for (const phrase of ["Приобретённое оборудование", "Недавние покупки", "Документы", "Сервис", "История объекта", "Обратиться по этому товару"]) {
      expect(page).toContain(phrase);
    }
    expect(page).toContain("Пока к этому объекту не привязано оборудование.");
    expect(page).not.toMatch(/Установлено|Гарантия действует|Состояние системы/);
  });

  it("preserves Home and Purchases continuity without client waterfalls", () => {
    const home = read("app/account/(private)/page.tsx");
    const purchases = read("app/account/(private)/purchases/page.tsx");
    expect(home).toContain("objects.slice(0, 3)");
    expect(purchases).toContain("service.customerObjectWorkspace(context.account, true)");
    expect(purchases).toContain("objectLink.objectName");
    expect(purchases).toContain("Выбрать объект");
    expect(purchases).not.toContain("useEffect");
  });

  it("keeps reassignment governed and exposes explicit pending/error feedback", () => {
    const action = read("src/modules/final-customer/actions.ts");
    const component = read("src/modules/final-customer/components/PurchaseObjectAssignment.tsx");
    expect(action).toContain("linkCustomerObjectPurchaseAction");
    expect(component).toContain("useActionState");
    expect(component).toContain("pending");
    expect(component).toContain("state.error");
  });
});
