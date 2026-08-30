import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ createCompetitiveObservationAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CompetitiveObservationForm } from "../components/CompetitiveObservationForm";
import { ProductCompetitiveIntelligence } from "../components/ProductCompetitiveIntelligence";
import type { PartnerProductCompetitiveIntelligence } from "../types";

const data: PartnerProductCompetitiveIntelligence = {
  canManage: true,
  windowDays: 30,
  competitors: [{ id: "11111111-1111-4111-8111-111111111111", name: "Exterior" }],
  summary: { observationCount: 1, latestDate: "2026-08-24", latestCompetitorPrice: 2450, latestCurrency: "MDL", latestNovotechPrice: 2520, latestNovotechCurrency: "MDL", latestDeltaAmount: 70, latestDeltaPercent: 2.8571 },
  observations: [{ id: "o1", date: "2026-08-24", competitorName: "Exterior", price: 2450, currency: "MDL", vatMode: "not_specified", quantity: 1, quantityCohort: "single", sourceType: "quotation", confidence: "medium", possibleOutlier: false, novotechPrice: 2520, novotechCurrency: "MDL", comparisonBasis: "partner_price", comparisonStatus: "comparable", deltaAmount: 70, deltaPercent: 2.8571, hasEvidence: false, evidenceId: null, supersedesObservationId: null, isSuperseded: false, createdAt: "2026-08-24T10:00:00Z" }],
};

describe("partner competitive intelligence UI", () => {
  it("renders only the supplied company history and immediate comparison", () => {
    render(<ProductCompetitiveIntelligence data={data} locale="ru" productId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.getAllByText("Exterior")).toHaveLength(2);
    expect(screen.getAllByText(/2[\s ]?450 MDL/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/70 MDL/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Сохранить цену" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Конкурентные цены" })).toHaveClass("text-xl");
    expect(screen.getByText(/Сохраняйте цены конкурентов по каждой модели/)).not.toHaveClass("max-w-3xl");
  });

  it("keeps the five-field fast path and optional conditions collapsed", () => {
    render(<CompetitiveObservationForm competitors={data.competitors} locale="ru" productId="22222222-2222-4222-8222-222222222222" today="2026-08-24" />);
    expect(screen.getByLabelText("Цена")).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("Количество")).toHaveValue(1);
    expect(screen.queryByLabelText("НДС")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Действительно до")).not.toBeInTheDocument();
    expect(screen.getByText("Дополнительные условия").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Дополнительные условия").closest("details")).not.toHaveClass("border-t");
    expect(screen.getByRole("button", { name: "Сохранить цену" }).closest("form")).not.toHaveClass("border-y");
  });

  it.each([
    ["ru", /Сохраняйте цены конкурентов по каждой модели/, /решения о закупке/],
    ["ro", /Salvați prețurile concurenților pentru fiecare model/, /decizii de achiziție/],
  ] as const)("renders the partner-value copy in %s", (locale, first, second) => {
    render(<ProductCompetitiveIntelligence data={data} locale={locale} productId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.getByText(first)).toHaveTextContent(second);
  });

  it("keeps historical observations with legacy VAT modes readable", () => {
    render(<ProductCompetitiveIntelligence data={data} locale="ru" productId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.getByRole("table")).toHaveTextContent("Exterior");
    expect(screen.getByRole("table")).toHaveTextContent("2 450 MDL");
  });

  it("renders a concise empty state and hides mutation controls for read-only access", () => {
    render(<ProductCompetitiveIntelligence data={{ ...data, canManage: false, observations: [], summary: { ...data.summary, observationCount: 0 } }} locale="ro" productId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.getByText(/Nu există încă observații/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează prețul" })).not.toBeInTheDocument();
  });
});
