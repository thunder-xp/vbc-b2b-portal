import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminGovernedPriceCoverageView } from "../AdminGovernedPriceCoverage";

describe("AdminGovernedPriceCoverage", () => {
  it("surfaces the governed 1C action without exposing technical references", () => {
    render(<AdminGovernedPriceCoverageView coverage={{
      generatedAt: "2026-09-04T00:00:00Z",
      summary: {
        activeOrderCapableCompanies: 38,
        activeCarts: 26,
        nonEmptyActiveCarts: 9,
        totalCartLines: 27,
        linesWithProductMapping: 27,
        linesWithGovernedPrice: 26,
        missingGovernedPriceLines: 1,
        uniqueAffectedCompanies: 1,
        uniqueAffectedProducts: 1,
        activeCartsBlocked: 1,
        governedValueExposureByCurrency: [{ currency: "USD", amount: 5758.84 }],
      },
      catalogCoverage: {
        publishedActiveProducts: 100,
        currentlyUsedPartnerPriceTypes: 4,
        potentialProductPriceTypePairs: 400,
        observedEligiblePairs: 300,
        meaningfulBuyingContextPairs: 20,
        meaningfulMissingPairs: 1,
        theoreticalGapsTreatedAsIssues: false,
      },
      issues: [{
        companyId: "2fbdbcd5-6a0d-4bbf-a103-11cca565a566",
        companyName: "MULTI-SECURITY",
        productId: "1c330b91-2c69-4239-8b2a-59fac121c978",
        sku: "400713",
        productName: "IPC-PT2849C1-S-PV-PRO",
        governedPriceType: "PLATINUM",
        severity: "high",
        classification: "source_gap_after_complete_sync",
        requiredAction: "Create or restore the governed product price in 1C, then run the existing price synchronization.",
      }],
    }} />);

    expect(screen.getByText("MULTI-SECURITY")).toBeInTheDocument();
    expect(screen.getByText("400713")).toBeInTheDocument();
    expect(screen.getByText("PLATINUM")).toBeInTheDocument();
    expect(screen.getByText("Высокий")).toBeInTheDocument();
    expect(screen.getByText(/Создайте или восстановите назначенную цену в 1С/)).toBeInTheDocument();
    expect(screen.queryByText(/2fbdbcd5|1c330b91|price type ref|rpc/i)).not.toBeInTheDocument();
  });
});
