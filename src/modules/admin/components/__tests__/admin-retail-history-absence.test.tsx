import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminRetailHistoryAbsenceDiagnostic } from "../AdminRetailHistoryAbsenceDiagnostic";

describe("AdminRetailHistoryAbsenceDiagnostic", () => {
  it("renders the production-sized read-only classification and current RETAIL", () => {
    render(
      <AdminRetailHistoryAbsenceDiagnostic
        filters={{}}
        result={{
          summary: {
            activePartnerVisibleProducts: 855,
            productsWithVerifiedHistory: 790,
            baselineOnlyProducts: 0,
            productsWithoutRetailRegisterSource: 65,
            unresolvedOutOfScopeHistoricalReferences: 1262,
          },
          categories: [{ id: "11111111-1111-1111-1111-111111111111", name: "Камеры", count: 65 }],
          reasonCounts: { no_retail_register_record: 65 },
          page: 1,
          pageSize: 25,
          total: 65,
          records: [{
            id: "22222222-2222-2222-2222-222222222222",
            imageUrl: null,
            sku: "400001",
            name: "Тестовый товар",
            categoryId: "11111111-1111-1111-1111-111111111111",
            categoryName: "Камеры",
            brandName: "Dahua",
            portalStatus: "active_visible",
            currentRetailPrice: 2399,
            currentRetailCurrency: "MDL",
            currentRetailEffectiveAt: "2026-07-08T00:00:00.000Z",
            baselineHistoryState: "present",
            firstPortalPublishedAt: "2026-07-09T00:00:00.000Z",
            external1cRef: "33333333-3333-3333-3333-333333333333",
            absenceReason: "current_price_without_historical_source",
          }],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Активные товары без истории RETAIL" })).toBeInTheDocument();
    expect(screen.getAllByText("65")).toHaveLength(2);
    expect(screen.getByText(/2\s399,00\sMDL/)).toBeInTheDocument();
    expect(screen.getByText("Есть текущая цена без источника истории")).toBeInTheDocument();
    expect(screen.getByText("Активен и видим")).toBeInTheDocument();
  });

  it("provides bounded search and classification filters", () => {
    render(
      <AdminRetailHistoryAbsenceDiagnostic
        filters={{ search: "400", reason: "no_retail_register_record" }}
        result={{
          summary: {
            activePartnerVisibleProducts: 855,
            productsWithVerifiedHistory: 790,
            baselineOnlyProducts: 0,
            productsWithoutRetailRegisterSource: 65,
            unresolvedOutOfScopeHistoricalReferences: 1262,
          },
          categories: [],
          reasonCounts: { no_retail_register_record: 65 },
          page: 1,
          pageSize: 25,
          total: 0,
          records: [],
        }}
      />,
    );

    expect(screen.getByLabelText("Поиск по SKU или названию")).toHaveValue("400");
    expect(screen.getByLabelText("Причина отсутствия")).toHaveValue("no_retail_register_record");
    expect(screen.getByText("По выбранным условиям товары не найдены.")).toBeInTheDocument();
  });
});
