import { describe, expect, it } from "vitest";

import { resolveWorkspaceCapabilities } from "../workspace-capability.service";

describe("resolveWorkspaceCapabilities", () => {
  it("builds installer navigation from role permissions and release configuration", () => {
    const model = resolveWorkspaceCapabilities(new Set([
      "catalog.view",
      "prices.view",
      "stock.view",
      "orders.create",
      "documents.view_company",
    ]));

    expect(model.navigation.map((item) => item.label)).toEqual([
      "Рабочий стол",
      "Каталог",
      "Подбор решения",
      "Проекты",
      "Сметы и КП",
      "Заказы",
      "Документы",
      "Сервис и гарантия",
      "База знаний",
      "Моя компания",
    ]);
    expect(model.navigation.find((item) => item.key === "projects")).toMatchObject({ href: null, availability: "coming_soon" });
    expect(model.productCard).toMatchObject({ showPrice: true, showStock: true, showWarehouseAvailability: true });
  });

  it("hides role-protected modules and commercial fields when permissions are absent", () => {
    const model = resolveWorkspaceCapabilities(new Set());

    expect(model.navigation.map((item) => item.key)).toEqual(["dashboard", "company"]);
    expect(model.productCard.showPrice).toBe(false);
    expect(model.productCard.showStock).toBe(false);
    expect(model.canCreateCommercialProposal).toBe(false);
  });

  it("applies server capability configuration to navigation and commercial visibility", () => {
    const model = resolveWorkspaceCapabilities(
      new Set(["catalog.view", "prices.view", "stock.view"]),
      {
        modules: { catalog: "coming_soon", knowledge_base: "hidden" },
        priceVisibility: false,
        warehouseVisibility: false,
      },
    );

    expect(model.navigation.find((item) => item.key === "catalog")).toMatchObject({ availability: "coming_soon", href: null });
    expect(model.navigation.some((item) => item.key === "knowledge_base")).toBe(false);
    expect(model.productCard.showPrice).toBe(false);
    expect(model.productCard.showStock).toBe(true);
    expect(model.productCard.showWarehouseAvailability).toBe(false);
  });
});
