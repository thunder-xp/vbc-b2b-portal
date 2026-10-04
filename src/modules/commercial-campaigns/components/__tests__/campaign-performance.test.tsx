import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignPerformance, CampaignResultsFilter } from "../CampaignPerformance";
import { CampaignViewEvidence } from "../CampaignViewEvidence";
import { campaignPerformancePeriod, observedRate, type CampaignPerformanceSummary } from "../../performance";

const record = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../actions/commercial-campaign.actions", () => ({ recordCampaignEngagementAction: record }));
afterEach(cleanup);
beforeEach(() => { record.mockClear(); sessionStorage.clear(); });

describe("campaign evidence presentation", () => {
  it("records one detail view on mount, reuses the existing session across refreshes, and never emits per render", async () => {
    const first = render(<CampaignViewEvidence campaignId="campaign-1" />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const sessionId = record.mock.calls[0][0].sessionId;
    expect(sessionId).toBe(sessionStorage.getItem("novotech-behavior-session"));
    first.rerender(<CampaignViewEvidence campaignId="campaign-1" />);
    expect(record).toHaveBeenCalledTimes(1);
    first.unmount(); render(<CampaignViewEvidence campaignId="campaign-1" />);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(record.mock.calls[1][0].sessionId).toBe(sessionId);
    expect(record.mock.calls[1][0].requestId).not.toBe(record.mock.calls[0][0].requestId);
    // Server uniqueness bounds those navigation requests by actor/company/session/publication.
  });
  it("measurement failures do not affect page presentation", async () => {
    record.mockRejectedValueOnce(new Error("offline"));
    render(<><h1>Offer</h1><CampaignViewEvidence campaignId="campaign-1" /></>);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "Offer" })).toBeVisible();
  });
  it("distinguishes missing historical views from actual zero orders and explains the commercial contract", () => {
    render(<CampaignPerformance summary={summary} />);
    expect(screen.getAllByText("Нет данных").length).toBeGreaterThan(0);
    expect(screen.getByText(/Учёт просмотров ещё не активирован/)).toBeVisible();
    expect(screen.getByText(/после успешной отправки с неизменяемым подтверждением цены PROMO/)).toBeVisible();
    expect(screen.getByText(/GP и наблюдаемая разница/)).toBeVisible();
    expect(screen.getByText(/не причинность/)).toBeVisible();
  });
  it("keeps publication and bounded-period controls on the same Results view", () => {
    render(<CampaignResultsFilter query={{ period: "30", version: "2" }} versions={[1, 2]} />);
    expect(screen.getByLabelText("Публикация")).toHaveValue("2");
    expect(screen.getByLabelText("Период")).toHaveValue("30");
  });
  it("displays the selected inclusive last calendar day, not the SQL exclusive boundary", () => {
    const period = campaignPerformancePeriod({ period: "custom", from: "2026-09-26", to: "2026-09-30" });
    render(<CampaignPerformance summary={{ ...summary, period: { from: period.from!, to: period.to! } }} />);
    expect(screen.getByText(/26\.09\.2026 — 30\.09\.2026 · UTC/)).toBeVisible();
    expect(screen.queryByText(/01\.10\.2026 · UTC/)).not.toBeInTheDocument();
  });
});

describe("bounded descriptive reporting", () => {
  it("uses whole inclusive UTC calendar days for custom periods and rejects unbounded/invalid dates", () => {
    expect(campaignPerformancePeriod({ period: "custom", from: "2026-10-01", to: "2026-10-04" })).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", version: null });
    expect(() => campaignPerformancePeriod({ period: "custom", from: "2025-01-01", to: "2026-10-04" })).toThrow();
    expect(() => campaignPerformancePeriod({ version: "-1" })).toThrow();
    expect(() => campaignPerformancePeriod({ period: "custom", from: "2026-02-30", to: "2026-03-04" })).toThrow();
  });
  it("returns unavailable ratios without a viewing denominator and uses only an intersecting cohort", () => {
    expect(observedRate(0, null)).toBe("Нет данных");
    expect(observedRate(1, 4)).toBe("25%");
  });
});

const summary: CampaignPerformanceSummary = {
  campaignId: "campaign-1", name: "Test offer", mechanicType: "spend_threshold_promo", status: "active",
  period: { from: "2026-10-01", to: "2026-10-04" }, publicationVersion: null, versions: [1], audienceCompanies: 1,
  viewsStartedAt: null, viewCoverageComplete: false, offerViews: null, viewingCompanies: null,
  interactingCompanies: 0, viewedInteractingCompanies: 0, qualifiedCompanies: 0, viewedQualifiedCompanies: 0,
  actionQualifiedCompanies: 0, addActions: 0, completeKitActions: 0, rewardAddActions: 0,
  benefitCompanies: 0, attributedOrders: 0, attributedLines: 0, attributedUnits: 0, participatingSkus: 0,
  rewardPurchasedLines: 0, rewardPurchasedUnits: 0, qualifyingSpendUsd: null,
  attributedOrderValue: [], campaignPricedLineValue: [], observedPriceBenefit: null, grossProfit: null,
};
