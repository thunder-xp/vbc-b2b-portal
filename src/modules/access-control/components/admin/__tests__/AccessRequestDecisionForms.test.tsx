import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveAccessRequestAction: vi.fn(),
  rejectAccessRequestAction: vi.fn(),
  searchOneCPartnersAction: vi.fn(),
  getOneCPartnerContractsAction: vi.fn(),
  listOneCPriceTypesAction: vi.fn(),
}));

vi.mock("../../../actions/admin/access-approval.actions", () => ({
  approveAccessRequestAction: mocks.approveAccessRequestAction,
  rejectAccessRequestAction: mocks.rejectAccessRequestAction,
}));

vi.mock("@/src/modules/integration/actions", () => ({
  searchOneCPartnersAction: mocks.searchOneCPartnersAction,
  getOneCPartnerContractsAction: mocks.getOneCPartnerContractsAction,
  listOneCPriceTypesAction: mocks.listOneCPriceTypesAction,
}));

import { AccessRequestDecisionForms } from "../AccessRequestDecisionForms";

describe("AccessRequestDecisionForms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchOneCPartnersAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "1C partner search completed.",
      data: [
        {
          displayName: "Partner Company",
          legalName: "Partner Company Ltd.",
          taxId: "BG123456789",
          external1cId: "PARTNER-1",
          code: "000001",
          fullName: "Partner Company Ltd.",
          buyer: true,
          supplier: false,
        },
      ],
    });
    mocks.getOneCPartnerContractsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "1C contracts loaded.",
      data: [{
        external1cContractId: "CONTRACT-1",
        code: "C-1",
        name: "Default contract",
        number: "1",
        date: "2026-01-01",
        contractType: "Buyer",
        priceTypeSource: "counterparty",
        priceType: { external1cPriceTypeId: "PRICE-1", name: "Wholesale", currency: "BGN" },
      }],
    });
    mocks.listOneCPriceTypesAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "1C price types loaded.",
      data: [{ external1cPriceTypeId: "PRICE-MANUAL", name: "Manual wholesale", currency: "MDL" }],
    });
    mocks.approveAccessRequestAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Access request approved.",
      data: null,
    });
  });

  it("searches 1C and auto-populates approval binding", async () => {
    const user = userEvent.setup();
    render(<AccessRequestDecisionForms requestId="request-1" />);

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Search in 1C" }));
    await user.type(
      screen.getByPlaceholderText("Company name, VAT/IDNO, or 1C reference"),
      "BG123456789",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Select counterparty" }));

    expect(screen.getByText("PARTNER-1")).toBeInTheDocument();
    expect(screen.getByText("CONTRACT-1")).toBeInTheDocument();
    expect(screen.getByText("PRICE-1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(mocks.approveAccessRequestAction).toHaveBeenCalledWith({
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cCode: "000001",
      external1cContractId: "CONTRACT-1",
      external1cPriceTypeId: "PRICE-1",
      decisionReason: "",
    });
  });

  it("shows safe search error without approving", async () => {
    const user = userEvent.setup();
    mocks.searchOneCPartnersAction.mockResolvedValue({
      success: false,
      errorCode: "SYSTEM_ERROR",
      message: "Unexpected system failure.",
      data: null,
    });
    render(<AccessRequestDecisionForms requestId="request-1" />);

    await user.click(screen.getByRole("button", { name: "Search in 1C" }));
    await user.type(
      screen.getByPlaceholderText("Company name, VAT/IDNO, or 1C reference"),
      "Partner",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Unexpected system failure.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("shows a specific empty-contract message after selecting a counterparty", async () => {
    const user = userEvent.setup();
    mocks.getOneCPartnerContractsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "1C contracts loaded.",
      data: [],
    });
    render(<AccessRequestDecisionForms requestId="request-1" />);

    await user.click(screen.getByRole("button", { name: "Search in 1C" }));
    await user.type(
      screen.getByPlaceholderText("Company name, VAT/IDNO, or 1C reference"),
      "Partner",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Select counterparty" }));

    expect(await screen.findByText("Для выбранного контрагента договоры в 1С не найдены.")).toBeInTheDocument();
    expect(screen.queryByText("1C is temporarily unavailable.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("uses the selected contract price type for approval binding", async () => {
    const user = userEvent.setup();
    mocks.searchOneCPartnersAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "1C partner search completed.",
      data: [
        {
          displayName: "Partner Company",
          legalName: "Partner Company Ltd.",
          taxId: "BG123456789",
          external1cId: "PARTNER-1",
          code: "000001",
          fullName: "Partner Company Ltd.",
          buyer: true,
          supplier: false,
        },
      ],
    });
    mocks.getOneCPartnerContractsAction.mockResolvedValue({
      success: true, errorCode: null, message: "1C contracts loaded.", data: [
        { external1cContractId: "CONTRACT-1", code: "C-1", name: "Main contract", number: "1", date: null, contractType: null, priceTypeSource: "contract", priceType: { external1cPriceTypeId: "PRICE-1", name: "Base", currency: null } },
        { external1cContractId: "CONTRACT-2", code: "C-2", name: "Distributor contract", number: "2", date: null, contractType: null, priceTypeSource: "counterparty", priceType: { external1cPriceTypeId: "PRICE-DISTRIBUTOR", name: "Distributor", currency: null } },
      ],
    });
    render(<AccessRequestDecisionForms requestId="request-1" />);

    await user.click(screen.getByRole("button", { name: "Search in 1C" }));
    await user.type(
      screen.getByPlaceholderText("Company name, VAT/IDNO, or 1C reference"),
      "Partner",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Select counterparty" }));
    await user.click(
      await screen.findByRole("button", { name: /Distributor contract/ }),
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(mocks.approveAccessRequestAction).toHaveBeenCalledWith({
      requestId: "request-1",
      external1cId: "PARTNER-1",
      external1cCode: "000001",
      external1cContractId: "CONTRACT-2",
      external1cPriceTypeId: "PRICE-DISTRIBUTOR",
      decisionReason: "",
    });
  });

  it("requires manual price type selection when the contract has none", async () => {
    const user = userEvent.setup();
    mocks.getOneCPartnerContractsAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "1C contracts loaded.",
      data: [{
        external1cContractId: "CONTRACT-1",
        code: "C-1",
        name: "Contract without price type",
        number: "1",
        date: null,
        contractType: null,
        priceTypeSource: null,
        priceType: null,
      }],
    });
    render(<AccessRequestDecisionForms requestId="request-1" />);

    await user.click(screen.getByRole("button", { name: "Search in 1C" }));
    await user.type(screen.getByPlaceholderText("Company name, VAT/IDNO, or 1C reference"), "Partner");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: "Select counterparty" }));
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: /Manual wholesale/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());
  });
});
