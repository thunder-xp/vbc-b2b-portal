import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminCompanyContractMappingProjection } from "../../types";
import { AdminCompanyCashContractMapping } from "../AdminCompanyCashContractMapping";

vi.mock("../../actions", () => ({
  mapAdminCompanyCashContractAction: vi.fn(),
  removeAdminCompanyCashContractAction: vi.fn(),
}));

describe("AdminCompanyCashContractMapping", () => {
  it("shows exact governed candidates, diagnostics, and no free-text GUID input", () => {
    render(<AdminCompanyCashContractMapping mapping={mapping()} />);

    expect(screen.getByRole("heading", { name: "Договор для наличной оплаты" })).toBeInTheDocument();
    expect(screen.getByText("Сопоставление отсутствует")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Valid cash candidate/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Invalid currency/ })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: /GUID/i })).not.toBeInTheDocument();
  });

  it("shows governed removal and immutable history for an active mapping", () => {
    const value = mapping();
    value.cashMapping = {
      contractRole: "cash",
      contractRef: value.candidates[0]!.external1cId,
      active: true,
      version: 2,
      reason: "Approved cash settlement contract",
      updatedAt: "2026-08-22T08:00:00Z",
      qualificationCode: "CASH_CONTRACT_QUALIFIED",
      qualified: true,
      events: [{
        id: "event-1",
        eventType: "mapped",
        previousContractRef: null,
        newContractRef: value.candidates[0]!.external1cId,
        reason: "Approved cash settlement contract",
        occurredAt: "2026-08-22T08:00:00Z",
        mappingVersion: 2,
        qualificationCode: "CASH_CONTRACT_QUALIFIED",
      }],
    };
    render(<AdminCompanyCashContractMapping mapping={value} />);

    expect(screen.getByText("Сопоставление действительно")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить сопоставление" })).toBeInTheDocument();
    expect(screen.getByText("История сопоставления")).toBeInTheDocument();
  });
});

function mapping(): AdminCompanyContractMappingProjection {
  return {
    companyId: "a1e41e0e-f56d-4175-a4ae-b2ffa5dab71f",
    counterpartyRef: "2463c9e4-e4e6-11ed-0899-7239d3b7bd5c",
    currentContractRef: null,
    currentPriceTypeRef: "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
    currentPriceTypeName: "GOLD",
    currentCurrencyCode: "USD",
    commercialProfileState: "contract_missing",
    commercialProfileVersion: 1,
    commercialProfileVerifiedAt: null,
    priceSnapshotAt: null,
    publishedPriceCount: 0,
    version: 1,
    canManage: true,
    canSync: true,
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
      candidate({ name: "Valid cash candidate" }),
      candidate({
        external1cId: "90bb346a-e4eb-11ed-0899-7239d3b7bd5c",
        name: "Invalid currency",
        cashQualified: false,
        cashQualificationCode: "CASH_CONTRACT_CURRENCY_MISMATCH",
      }),
    ],
  };
}

function candidate(overrides: Partial<AdminCompanyContractMappingProjection["candidates"][number]>) {
  return {
    external1cId: "3cbb3466-f03b-11ef-0280-7239d3b7bd5c",
    code: "UU-002389",
    name: "Cash contract",
    number: "CASH-1",
    date: "2025-02-21T00:00:00Z",
    contractType: "СПокупателем",
    organizationRef: "4643d461-aa49-4b70-9486-a59f80ee6af8",
    signed: true,
    active: true,
    deleted: false,
    priceTypeRef: "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
    priceTypeName: "RETAIL",
    currencyCode: "MDL",
    currencyRef: "8c7e5d50-6b31-11e6-80cc-000c29b424d1",
    default: false,
    synchronizedAt: "2026-08-22T07:00:00Z",
    cashQualified: true,
    cashQualificationCode: "CASH_CONTRACT_QUALIFIED" as const,
    ...overrides,
  };
}
