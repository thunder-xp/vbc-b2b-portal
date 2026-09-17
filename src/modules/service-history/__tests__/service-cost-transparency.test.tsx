import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OneCServiceHistorySummary, ServiceMonthlySummaryCard, UnifiedServiceHistoryList, formatDecimalMoney } from "../components";
import { normalizeServiceMonth } from "../service";
import type { OneCServiceHistoryDetail, UnifiedServiceHistoryItem } from "../types";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260917062913_b2b_service_center_cost_transparency_v1.sql"),
  "utf8",
);
const backfillScopeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260917063742_service_history_financial_backfill_active_scope.sql"),
  "utf8",
);

describe("service cost transparency", () => {
  it("renders authoritative amount in the list and a gross/VAT breakdown in detail", () => {
    const item: UnifiedServiceHistoryItem = {
      id: "11111111-1111-1111-1111-111111111111", sourceType: "one_c", number: "NSUU-000296",
      date: "2026-09-10T10:00:00Z", status: "issued_to_customer", productId: null, productSku: "170110",
      productName: "Dahua DHI-ARA11", productImageUrl: null, productHref: null, maskedSerial: "3L0***DPA",
      reportedFault: "Не включается", workSummary: "Сброс пароля", serviceAmount: "250.00", vatAmount: "41.67",
      currency: "MDL", warrantyState: null, warrantyEndDate: null, updatedAt: "2026-09-11T10:00:00Z",
      href: "/cabinet/service/history/11111111-1111-1111-1111-111111111111",
    };
    const { rerender } = render(<UnifiedServiceHistoryList page={{ items: [item], page: 1, total: 1 }} />);
    expect(screen.getByText("250,00 MDL")).toBeInTheDocument();
    expect(screen.getByText("Сброс пароля")).toBeInTheDocument();

    rerender(<OneCServiceHistorySummary detail={detail()} />);
    expect(screen.getByRole("heading", { name: "Стоимость услуг" })).toBeInTheDocument();
    expect(screen.getByText("250,00 MDL")).toBeInTheDocument();
    expect(screen.getByText("41,67 MDL")).toBeInTheDocument();
    expect(screen.getByText("Сумма из 1С включает НДС.")).toBeInTheDocument();
    expect(screen.getByText("Сервисный договор")).toBeInTheDocument();
  });

  it("renders contract-independent multi-currency monthly totals and an empty state", () => {
    const { rerender } = render(<ServiceMonthlySummaryCard locale="ru" summary={{
      month: "2026-09", previousMonth: "2026-08", nextMonth: null, unknownCurrencyCount: 0,
      currencies: [
        { currency: "MDL", completedServiceCount: 3, totalServiceAmount: "850.00", totalVatAmount: "141.67" },
        { currency: "EUR", completedServiceCount: 1, totalServiceAmount: "100.00", totalVatAmount: "20.00" },
      ],
    }} />);
    expect(screen.getByText("850,00 MDL")).toBeInTheDocument();
    expect(screen.getByText("100,00 EUR")).toBeInTheDocument();
    expect(screen.getByLabelText("Предыдущий месяц")).toHaveClass("size-11");
    expect(screen.getByLabelText("Следующий месяц")).toHaveAttribute("aria-disabled", "true");

    rerender(<ServiceMonthlySummaryCard locale="ro" summary={{ month: "2026-09", previousMonth: "2026-08", nextMonth: null, unknownCurrencyCount: 0, currencies: [] }} />);
    expect(screen.getByText("Nu există servicii prestate în această lună.")).toBeInTheDocument();
    expect(screen.getByText("Valoarea totală pentru lună")).toBeInTheDocument();
  });

  it("formats decimal strings without summing money in JavaScript and bounds requested months", () => {
    expect(formatDecimalMoney("1234567.8", "MDL")).toBe("1 234 567,80 MDL");
    const now = new Date("2026-09-17T10:00:00Z");
    expect(normalizeServiceMonth("2026-08", now)).toBe("2026-08");
    expect(normalizeServiceMonth("2027-01", now)).toBe("2026-09");
    expect(normalizeServiceMonth("not-a-month", now)).toBe("2026-09");
    expect(normalizeServiceMonth("2019-01", now)).toBe("2021-10");
  });

  it("keeps aggregation company-scoped, exact-decimal, status-ref driven, and independent of contract", () => {
    expect(migration).toContain("service_amount numeric(18,2)");
    expect(migration).toContain("vat_amount numeric(18,2)");
    expect(migration).toContain("h.company_id = p_company_id");
    expect(migration).toContain("sum(service_amount)");
    expect(migration).toContain("group by currency_code");
    expect(migration).not.toContain("group by contract_ref");
    expect(migration).toContain("'eae23441-315b-11e9-a7dc-94de80db60f1'");
    expect(migration).toContain("'eae23442-315b-11e9-a7dc-94de80db60f1'");
    expect(migration).toContain("repair_completed_at >= bounds.month_start");
    expect(migration).toContain("claim_one_c_service_history_sync_v3");
    expect(migration).toContain("financial_backfill");
    expect(migration).toContain("one_c_service_history_company_completed_month_idx");
    expect(migration).not.toMatch(/http|odata/i);
    expect(backfillScopeMigration).toContain("service_financial_checked_at is null and is_active");
    expect(backfillScopeMigration).not.toContain("service_financial_checked_at is null and partner_visible");
  });
});

function detail(): OneCServiceHistoryDetail {
  return {
    id: "11111111-1111-1111-1111-111111111111", number: "NSUU-000296", date: "2026-09-10T10:00:00Z",
    status: "issued_to_customer", sourceStatus: "Выдан покупателю",
    product: { id: null, sku: "170110", name: "Dahua DHI-ARA11", imageUrl: null, href: null },
    maskedSerial: "3L0***DPA", reportedFault: "Не включается", completedWorkSummary: "Сброс пароля", resolution: null,
    serviceAmount: "250.00", vatAmount: "41.67", currency: "MDL", sumIncludesVat: true,
    repairCompletedAt: "2026-09-10T12:00:00Z", issuedAt: "2026-09-11T12:00:00Z", contract: "Сервисный договор",
    warrantyState: null, warrantyStartDate: null, warrantyEndDate: null, serviceCenter: null,
    updatedAt: "2026-09-11T12:00:00Z", events: [],
  };
}
