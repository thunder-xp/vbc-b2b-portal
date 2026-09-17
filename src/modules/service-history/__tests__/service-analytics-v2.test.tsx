import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ServiceAnalyticsPanel } from "../components";
import { ServiceHistoryService } from "../service";
import type { ServiceAnalytics } from "../types";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260917090800_b2b_service_financial_transparency_v2.sql"), "utf8");
const xlsxRoute = readFileSync(resolve(process.cwd(), "app/api/service/export/xlsx/route.ts"), "utf8");
const pdfRoute = readFileSync(resolve(process.cwd(), "app/api/service/export/pdf/route.ts"), "utf8");

describe("B2B service financial analytics V2", () => {
  it("renders exact multi-currency analytics, comparisons and factual breakdowns in RU", () => {
    render(<ServiceAnalyticsPanel analytics={analytics()} locale="ru" />);
    expect(screen.getByRole("heading", { name: "Динамика и структура работ" })).toBeInTheDocument();
    expect(screen.getByText("275,00 MDL")).toBeInTheDocument();
    expect(screen.getByText("100,00 EUR")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("+350,00 MDL")).toBeInTheDocument();
    expect(screen.getByText("Сброс пароля")).toBeInTheDocument();
    expect(screen.getByText(/не является показателем надёжности/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /XLSX/ })).toHaveAttribute("href", "/api/service/export/xlsx?month=2026-09");
    expect(screen.getByRole("link", { name: /PDF/ })).toHaveAttribute("href", "/api/service/export/pdf?month=2026-09");
  });

  it("renders RO labels and the governed empty state without a meaningless chart", () => {
    render(<ServiceAnalyticsPanel analytics={{ ...analytics(), summaries: [], trend: [], productBreakdown: [], workBreakdown: [] }} locale="ro" />);
    expect(screen.getByRole("heading", { name: "Dinamica și structura lucrărilor" })).toBeInTheDocument();
    expect(screen.getByText("Nu există servicii prestate în perioada selectată.")).toBeInTheDocument();
    expect(screen.queryByText("Dinamica pe 12 luni")).not.toBeInTheDocument();
  });

  it("keeps analytics bounded, exact-decimal, company-scoped and non-accounting", () => {
    expect(migration).toContain("interval '11 months'");
    expect(migration).toContain("round(coalesce(s.total_service_amount, 0) / s.completed_service_count, 2)");
    expect(migration).toContain("h.company_id = p_company_id");
    expect(migration).toContain("public.has_permission(p_company_id, 'service.view')");
    expect(migration).toContain("group by currency_code");
    expect(migration).not.toContain("group by contract_ref");
    expect(migration).toContain("limit 5001");
    expect(migration).toContain("completed_work_summary");
    expect(migration).not.toMatch(/http|odata/i);
    expect(xlsxRoute).not.toContain("company_id");
    expect(pdfRoute).not.toContain("company_id");
    expect(xlsxRoute).toContain("getAuthenticatedUserId()");
    expect(pdfRoute).toContain("getAuthenticatedUserId()");
  });

  it("derives export tenancy from the active membership and fails closed at the row limit", async () => {
    const exportResult = { companyName: "Partner", month: "2026-09", rows: [], totals: [], rowCount: 0, truncated: false };
    const repository = { getPartnerMonthExport: vi.fn().mockResolvedValue(exportResult) };
    const access = { getOwnMemberships: vi.fn().mockResolvedValue([{ status: "active", companyId: "22222222-2222-2222-2222-222222222222" }]) };
    const service = new ServiceHistoryService(repository as never, access as never);

    await expect(service.getPartnerMonthExport("11111111-1111-1111-1111-111111111111", { month: "2026-09" })).resolves.toEqual(exportResult);
    expect(repository.getPartnerMonthExport).toHaveBeenCalledWith({ companyId: "22222222-2222-2222-2222-222222222222", month: "2026-09" });

    repository.getPartnerMonthExport.mockResolvedValueOnce({ ...exportResult, rowCount: 5001, truncated: true });
    await expect(service.getPartnerMonthExport("11111111-1111-1111-1111-111111111111", { month: "2026-09" })).rejects.toThrow("governed row limit");
  });
});

function analytics(): ServiceAnalytics {
  return {
    month: "2026-09", trendStart: "2025-10", previousMonth: "2026-08",
    summaries: [
      { currency: "MDL", completedServiceCount: 4, totalServiceAmount: "1100.00", totalVatAmount: "183.33", averageServiceAmount: "275.00", previousCompletedServiceCount: 2, previousTotalServiceAmount: "750.00", countDelta: 2, amountDelta: "350.00" },
      { currency: "EUR", completedServiceCount: 1, totalServiceAmount: "100.00", totalVatAmount: "20.00", averageServiceAmount: "100.00", previousCompletedServiceCount: 0, previousTotalServiceAmount: "0.00", countDelta: 1, amountDelta: "100.00" },
    ],
    trend: [
      { month: "2026-08", currency: "MDL", completedServiceCount: 2, totalServiceAmount: "750.00", totalVatAmount: "125.00", relativeAmountBps: 6818 },
      { month: "2026-09", currency: "MDL", completedServiceCount: 4, totalServiceAmount: "1100.00", totalVatAmount: "183.33", relativeAmountBps: 10000 },
      { month: "2026-09", currency: "EUR", completedServiceCount: 1, totalServiceAmount: "100.00", totalVatAmount: "20.00", relativeAmountBps: 10000 },
    ],
    productBreakdown: [{ productId: "11111111-1111-1111-1111-111111111111", productSku: "400499", productName: "DH-IPC-HFW1430S1-A-S5", currency: "MDL", completedServiceCount: 2, totalServiceAmount: "540.00" }],
    workBreakdown: [{ workDescription: "Сброс пароля", currency: "MDL", completedServiceCount: 2, totalServiceAmount: "500.00" }],
    missingProductCount: 0, missingWorkCount: 0, unknownCurrencyCount: 0,
  };
}
