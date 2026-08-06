import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ lookupPartnerWarrantySerialAction: vi.fn(), lookupInternalWarrantySerialAction: vi.fn() }));
import { PartnerWarrantySerialLookup, WarrantySerialDiagnosticsView } from "../components";

describe("warranty serial UI", () => {
  it("offers exact partner verification without exposing source identifiers", () => {
    render(<PartnerWarrantySerialLookup />);
    expect(screen.getByRole("heading", { name: "Проверка покупки и гарантии" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Введите серийный номер" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Проверить" })).toHaveClass("min-h-11");
    expect(screen.queryByText(/1C reference|Контрагент_Key|Ref_Key/)).not.toBeInTheDocument();
  });

  it("renders diagnostics without prices", () => {
    render(<WarrantySerialDiagnosticsView data={{ totalEvents: 1, uniqueSerials: 1, currentSales: 1, covered: 0, reviewRequired: 1, expired: 0, returned: 0, cancelled: 0, resold: 0, conflicts: 0, unmappedCompanies: 0, unmappedProducts: 0, missingWarrantyPeriod: 0, sourceIncomplete: 0, latestSaleDate: null, latestReturnDate: null, latestSync: null, reconciliationBacklog: 1, workerFailures: 0 }} />);
    expect(screen.getByText("Всего событий")).toBeInTheDocument();
    expect(screen.queryByText(/цена/i)).not.toBeInTheDocument();
  });
});
