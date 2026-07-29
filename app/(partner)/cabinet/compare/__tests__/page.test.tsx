import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ComparePage from "../page";

const getWorkspace = vi.fn();

vi.mock("@/src/modules/partner-cabinet/actions", () => ({
  getPartnerWorkspaceContextAction: () => getWorkspace(),
}));
vi.mock("@/src/modules/catalog/components/ProductComparisonView", () => ({
  ProductComparisonView: (props: Record<string, unknown>) => (
    <div data-testid="comparison-view">
      {JSON.stringify(props)}
    </div>
  ),
}));

describe("comparison page", () => {
  it("renders the canonical comparison without a category query parameter", async () => {
    getWorkspace.mockResolvedValue({
      success: true,
      data: {
        companyId: "company-1",
        userId: "user-1",
        capabilities: {
          productCard: {
            canAddToOrder: true,
            canAddToSpecification: true,
          },
        },
      },
    });

    render(await ComparePage());

    expect(screen.getByRole("heading", { name: "Сравнение товаров" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("comparison-view")).toHaveTextContent(
      '"companyId":"company-1"',
    );
  });

  it("shows a scoped access recovery state when no active company is available", async () => {
    getWorkspace.mockResolvedValue({
      success: false,
      data: null,
      errorCode: "MEMBERSHIP_REQUIRED",
      message: "denied",
    });

    render(await ComparePage());

    expect(screen.getByRole("heading", {
      name: "Сравнение временно недоступно",
    })).toBeInTheDocument();
  });
});
