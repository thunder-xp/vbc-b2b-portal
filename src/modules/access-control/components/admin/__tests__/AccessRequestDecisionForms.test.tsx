import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveAccessRequestAction: vi.fn(),
  rejectAccessRequestAction: vi.fn(),
  searchOneCPartnersAction: vi.fn(),
}));

vi.mock("../../../actions/admin/access-approval.actions", () => ({
  approveAccessRequestAction: mocks.approveAccessRequestAction,
  rejectAccessRequestAction: mocks.rejectAccessRequestAction,
}));

vi.mock("@/src/modules/integration/actions", () => ({
  searchOneCPartnersAction: mocks.searchOneCPartnersAction,
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
          contract: {
            external1cContractId: "CONTRACT-1",
            name: "Default contract",
          },
          priceType: {
            external1cPriceTypeId: "PRICE-1",
            name: "Wholesale",
            currency: "BGN",
          },
        },
      ],
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
    await user.click(await screen.findByText("Partner Company"));

    expect(screen.getByText("PARTNER-1")).toBeInTheDocument();
    expect(screen.getByText("CONTRACT-1")).toBeInTheDocument();
    expect(screen.getByText("PRICE-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(mocks.approveAccessRequestAction).toHaveBeenCalledWith({
      requestId: "request-1",
      external1cId: "PARTNER-1",
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
});
