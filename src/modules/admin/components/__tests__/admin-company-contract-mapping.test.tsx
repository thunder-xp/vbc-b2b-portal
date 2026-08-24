import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminCompanyContractMappingProjection } from "../../types";
import { AdminCompanyContractMapping } from "../AdminCompanyContractMapping";

vi.mock("../../actions", () => ({
  mapAdminCompanyContractAction: vi.fn(),
  synchronizeAdminCompanyCommercialProfileAction: vi.fn(),
}));

const mapping: AdminCompanyContractMappingProjection = {
  companyId: "a1e41e0e-f56d-4175-a4ae-b2ffa5dab71f",
  counterpartyRef: "2463c9e4-e4e6-11ed-0899-7239d3b7bd5c",
  currentContractRef: null,
  currentPriceTypeRef: "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
  currentPriceTypeName: "GOLD",
  currentCurrencyCode: "USD",
  commercialProfileState: "contract_missing",
  commercialProfileVersion: 1,
  commercialProfileVerifiedAt: null,
  priceSnapshotAt: "2026-08-18T16:00:42.557Z",
  publishedPriceCount: 750,
  version: 1,
  canManage: true,
  canSync: true,
  suggestedContractRef: "e5baa428-8919-11ee-129a-7239d3b7bd5c",
  defaultContractAmbiguous: false,
  cashMapping: {
    contractRole: "cash",
    contractRef: null,
    active: false,
    version: 0,
    reason: null,
    updatedAt: null,
    qualificationCode: "CASH_MAPPING_MISSING",
    qualified: false,
    events: [],
  },
  candidates: [
    candidate({ external1cId: "e5baa428-8919-11ee-129a-7239d3b7bd5c", name: "Customer GOLD", default: true }),
    candidate({ external1cId: "d1d54da8-a496-11ee-129a-7239d3b7bd5c", name: "Inactive", active: false }),
    candidate({ external1cId: "90bb346a-e4eb-11ed-0899-7239d3b7bd5c", name: "Deleted", deleted: true }),
    candidate({ external1cId: "246116a4-e4e6-11ed-0899-7239d3b7bd5c", name: "Supplier", contractType: "СПоставщиком" }),
    candidate({ external1cId: "c0e44b50-1d1d-11f1-d58d-7239d3b7bd5c", name: "Wrong organization", organizationRef: "11111111-1111-4111-8111-111111111111" }),
  ],
};

describe("AdminCompanyContractMapping", () => {
  it("shows one bounded local list with required governed contract facts", () => {
    render(<AdminCompanyContractMapping mapping={mapping} />);

    expect(screen.getByRole("heading", { name: "Основной договор 1С" })).toBeInTheDocument();
    expect(screen.getAllByText("Не сопоставлен")).toHaveLength(2);
    expect(screen.getByText("Customer GOLD")).toBeInTheDocument();
    expect(screen.getByText("Основной в 1С")).toBeInTheDocument();
    expect(screen.getAllByText("СПокупателем").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GOLD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Обновить коммерческий профиль из 1С/ })).not.toBeInTheDocument();
  });

  it("allows the valid customer contract and rejects invalid candidate structures", () => {
    render(<AdminCompanyContractMapping mapping={mapping} />);

    expect(screen.getByRole("radio", { name: /Customer GOLD/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Customer GOLD/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Inactive/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Deleted/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Supplier/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Wrong organization/ })).toBeDisabled();
    expect(screen.getByLabelText("Причина ручного сопоставления")).toBeRequired();
  });

  it("contains no browser-side Supabase input or free-text contract GUID", () => {
    render(<AdminCompanyContractMapping mapping={mapping} />);
    expect(screen.queryByRole("textbox", { name: /GUID/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(mapping.candidates.length);
  });

  it("offers only the governed 1C apply action for a mapped mismatch", () => {
    render(<AdminCompanyContractMapping mapping={{
      ...mapping,
      currentContractRef: mapping.candidates[0]!.external1cId,
      commercialProfileState: "mismatch",
    }} />);

    expect(screen.getByText(/Текущий профиль платформы:/)).toBeInTheDocument();
    expect(screen.getByText(/Основной договор 1С:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Применить данные из 1С" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /вид цены/i })).not.toBeInTheDocument();
  });
});

function candidate(overrides: Partial<AdminCompanyContractMappingProjection["candidates"][number]>) {
  const selectable = !["Inactive", "Deleted", "Supplier", "Wrong organization"].includes(overrides.name ?? "");
  return {
    external1cId: "3cbb3466-f03b-11ef-0280-7239d3b7bd5c",
    code: "UU-002389",
    name: "Customer contract",
    number: "NS-1",
    date: "2025-02-21T00:00:00",
    contractType: "СПокупателем",
    organizationRef: "4643d461-aa49-4b70-9486-a59f80ee6af8",
    signed: true,
    active: true,
    deleted: false,
    priceTypeRef: "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
    priceTypeName: "GOLD",
    settlementCurrencyCode: "MDL",
    settlementCurrencyRef: "settlement-currency-ref",
    priceCurrencyCode: "USD",
    priceCurrencyRef: "price-currency-ref",
    selectable,
    qualificationCode: selectable ? "CONTRACT_QUALIFIED" as const : "CONTRACT_INACTIVE" as const,
    default: false,
    synchronizedAt: "2026-08-18T16:00:42.557Z",
    cashQualified: true,
    cashQualificationCode: "CASH_CONTRACT_QUALIFIED" as const,
    ...overrides,
  };
}
