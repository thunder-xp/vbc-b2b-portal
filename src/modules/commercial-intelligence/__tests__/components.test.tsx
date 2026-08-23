import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompanyCompetitiveIntelligence } from "../components/CompanyCompetitiveIntelligence";
import { CompetitiveIntelligenceTables } from "../components/CompetitiveIntelligenceTables";

describe("competitive intelligence admin views", () => {
  it("renders price pressure and partner exposure without raw partner contributors", () => {
    render(<CompetitiveIntelligenceTables data={{
      counts: { productsUnderPressure: 1, partnersExposed: 1, lowConfidenceProducts: 1 },
      products: [{ productId: "p1", sku: "400540", productName: "Camera", sourceName: "Exterior", novotechPrice: 100,
        novotechCurrency: "USD", competitorMedianPrice: 90, competitorBestPrice: 90, competitorCurrency: "USD",
        gapAmount: 10, gapPct: 11.11, contributingPartnerCount: 1, freshnessDays: 2, confidence: "low", partnerExposureCount: 1, priority: 40 }],
      partners: [{ companyId: "c1", partnerName: "Controlled Partner", productsUnderPressure: 1, averageWeightedGap: 11.11,
        recentPurchasesAffected: 0, estimatedExposedRevenue: 0, currency: "USD", freshnessDays: 2, attentionLevel: "low" }],
    }} />);
    expect(screen.getByText("Товары под ценовым давлением")).toBeInTheDocument();
    expect(screen.getByText("Конкурентная экспозиция партнёров")).toBeInTheDocument();
    expect(screen.getByText("Низкая")).toBeInTheDocument();
    expect(screen.queryByText(/contributor company id/i)).not.toBeInTheDocument();
  });

  it("renders the internal company view and omits it without permission", () => {
    const { rerender } = render(<CompanyCompetitiveIntelligence data={{ items: [{
      sku: "400540", productName: "Camera", sourceName: "Exterior", novotechPrice: 100,
      competitorPrice: 90, currency: "USD", gapPct: 11.11, purchases90d: 0,
      lastPurchaseAt: null, confidence: "low",
    }] }} />);
    expect(screen.getByText("Ценовая конкуренция")).toBeInTheDocument();
    rerender(<CompanyCompetitiveIntelligence data={null} />);
    expect(screen.queryByText("Ценовая конкуренция")).not.toBeInTheDocument();
  });
});
