import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminCommercialIntegrityView } from "../AdminCommercialIntegrity";

describe("AdminCommercialIntegrityView", () => {
  it("shows safe cart and order classifications without commercial amounts", () => {
    render(<AdminCommercialIntegrityView integrity={{
      generatedAt: "2026-08-02T16:00:00Z",
      cartSummary: {
        activeLines: 2,
        fullyResolved: 1,
        missingPartnerPrice: 1,
        missingRetail: 0,
        missingStock: 1,
        staleStock: 0,
        stalePrice: 0,
        missingCompanyPriceProfile: 0,
        oldestUnresolvedAt: "2026-08-02T15:00:00Z",
      },
      cartLines: [{
        id: "line-1",
        cartId: "cart-1",
        companyName: "ALERT-SS SRL",
        sku: "200007",
        productName: "Camera",
        reasons: ["missing_partner_price", "missing_stock"],
        hasConfirmedArrival: false,
        updatedAt: "2026-08-02T15:00:00Z",
      }],
      orderSummary: { reviewRequired: 0, sourceDeleted: 1, zeroLocalLines: 0, partiallyResolved: 0 },
      orders: [{
        id: "history-1",
        orderNumber: "NSUU-002067",
        companyName: "ALERT-SS SRL",
        sourceLineCount: 0,
        localLineCount: 0,
        unmappedLineCount: 0,
        reason: "source_document_deleted",
        lastSyncedAt: "2026-08-02T15:00:00Z",
      }],
      priceSync: null,
      stockSync: null,
    }} />);

    expect(screen.getAllByText("ALERT-SS SRL")).toHaveLength(2);
    expect(screen.getByText("Нет текущей партнёрской цены; Нет опубликованного остатка")).toBeInTheDocument();
    expect(screen.getByText("Документ удалён в 1С")).toBeInTheDocument();
    expect(screen.queryByText(/price_amount|document_total/i)).not.toBeInTheDocument();
  });
});
