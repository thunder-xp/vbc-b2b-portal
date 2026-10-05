import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WorkspaceHomeDto } from "../../services";
import { DashboardOverviewCards } from "../DashboardOverviewCards";

type Opportunity = NonNullable<WorkspaceHomeDto["estimateSalesOpportunities"]>[number];

const base: Opportunity = {
  id: "awaiting_customer:version-1",
  type: "awaiting_customer",
  priority: 4,
  estimateId: "estimate-1",
  versionId: "version-1",
  estimateNumber: "KP-1",
  proposalName: "Office CCTV",
  customerName: "Client SRL",
  projectName: "Office",
  amount: 30696,
  currency: "MDL",
  waitingSince: "2026-09-01T10:00:00Z",
  validUntil: "2026-09-15T10:00:00Z",
  followUpState: "sent_opened_no_response",
  action: "resend",
  href: "/cabinet/estimates/estimate-1?proposalAction=resend&version=version-1#estimate-order-conversion",
};

function workspace(items: Opportunity[]): WorkspaceHomeDto {
  return {
    identity: { firstName: "Partner", greeting: "Partner" },
    company: { name: "Partner SRL", role: "owner", priceType: null },
    capabilities: {
      navigation: [{ key: "proposals", label: "Сметы и КП", icon: "proposals", href: "/cabinet/estimates", availability: "available" }],
      productCard: {
        showPrice: false, showStock: false, showExactQuantity: false, showWarehouseAvailability: false,
        showExpectedArrival: false, showProjectPriceEligibility: false, showTechnicalDocuments: false,
        showCompatibility: false, canAddToSpecification: false, canAddToOrder: false, canAddToProject: false,
      },
      canCreateCommercialProposal: true, canViewEstimates: true, canSendProposal: true, canConvertEstimates: true,
      canUseWarranty: false, canViewKnowledgeBase: false, canViewDashboardDocuments: false,
      canViewCompetitiveIntelligence: false, canManageCompetitiveIntelligence: false,
    },
    attentionItems: [],
    estimateSalesOpportunities: items,
    orderSummary: { active: 0, confirmed: 0, attention: 0, portalProcessing: 0, recent: [] },
    shipmentSummary: { overdue: 0, today: 0, nextThreeDays: 0, later: 0, items: [] },
    quickActions: [], continuationItems: [], reorderProducts: [], reorderProductTotalCount: 0,
    discoveryProducts: [], specialOfferProducts: [], opportunities: [], recentDocuments: [],
    financeSummary: null, financeGuidance: null, salesAnalytics: null, companySummary: null,
    commercialConfigurationMissing: false, purchasingDynamics: null, commercialFreshness: [],
  };
}

describe("DashboardOverviewCards sales follow-up context", () => {
  it("does not add follow-up validity context to existing opportunity types", () => {
    render(<DashboardOverviewCards workspace={workspace([{ ...base, type: "ready_to_send", priority: 3, followUpState: null, action: "open_and_send", validUntil: "2035-12-31T10:00:00Z" }])} locale="ru" />);
    expect(document.body.textContent).not.toContain("2035");
  });

  it("renders compact truthful opened and not-opened signals without delivery PII", () => {
    const { rerender } = render(<DashboardOverviewCards workspace={workspace([base])} locale="ru" />);
    expect(screen.getByText(/Клиент открыл предложение/)).toBeInTheDocument();
    expect(screen.getByText("KP-1")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/30.*696.*MDL/);
    expect(screen.getByRole("link", { name: "Отправить повторно" })).toHaveAttribute("href", base.href);
    expect(document.body.textContent).not.toContain("client@example.com");

    rerender(<DashboardOverviewCards workspace={workspace([{ ...base, followUpState: "sent_not_opened" }])} locale="ru" />);
    expect(screen.getByText(/Предложение ещё не открыто/)).toBeInTheDocument();
  });

  it("renders Romanian follow-up and an honest expired update action", () => {
    render(<DashboardOverviewCards workspace={workspace([{ ...base, followUpState: "expired_sent", action: "update", validUntil: "2026-08-20T10:00:00Z", href: "/cabinet/estimates/estimate-1#estimate-order-conversion" }])} locale="ro" />);
    expect(screen.getByText(/Perioada de valabilitate a ofertei a expirat/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Actualizează oferta" })).toHaveAttribute("href", "/cabinet/estimates/estimate-1#estimate-order-conversion");
    expect(screen.queryByText(/valabilă până la/)).not.toBeInTheDocument();
  });
});
