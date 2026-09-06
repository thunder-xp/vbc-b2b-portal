import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FinanceOverview } from "../FinanceOverview";
import type { FinanceOverview as Model } from "../../types";

describe("FinanceOverview states", () => {
  it.each([
    ["never_synchronized", "Финансовые данные ещё не загружены"],
    ["mapping_missing", "Финансовые данные недоступны"],
    ["failed_without_snapshot", "Финансовые данные временно недоступны"],
    ["synchronized_zero", "Нет ненулевых балансов"],
  ] as const)("renders %s safely", (state, title) => {
    render(<FinanceOverview overview={overview(state)} />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("keeps a previous snapshot visible after synchronization failure", () => {
    const model = overview("failed_with_snapshot");
    model.synchronizedAt = "2026-08-05T12:00:00.000Z";
    model.contracts = [{ id: "b", companyId: "c", externalContractRef: "r", contractNumber: "NS-1", contractName: "NS-1", currencyRef: "m", currencyCode: "MDL", signedBalance: "100", sourceVersion: null, synchronizedAt: new Date().toISOString(), balanceType: "receivable", absoluteDisplayAmount: "100.00" }];
    model.summaries = [{ currencyCode: "MDL", receivableTotal: "100.00", advanceTotal: "0.00" }];
    model.showLastConfirmedNotice = true;
    render(<FinanceOverview overview={model} />);
    expect(screen.queryByText(/Данные давно не обновлялись/)).not.toBeInTheDocument();
    expect(screen.getByText("NS-1")).toBeInTheDocument();
    expect(screen.getAllByText(/Обновлено/).length).toBeGreaterThan(0);
  });
  it("renders the mobile-first chronological payment calendar, partial amounts, history and order navigation in RO", () => {
    const model = overview("synchronized_nonzero");
    model.paymentCalendar = {
      freshness: "FINANCE_DATA_FRESH", synchronizedAt: "2026-09-06T08:00:00Z", unavailableCount: 1,
      summaries: [
        { currency: "MDL", outstanding: "1750.40", overdue: "1750.40", nextPaymentAmount: "1750.40", nextPaymentDueDate: "2026-09-03" },
        { currency: "USD", outstanding: "50.00", overdue: "0.00", nextPaymentAmount: "50.00", nextPaymentDueDate: "2026-09-09" },
      ],
      current: [payment("partial", "CO-PARTIAL", "2026-09-03", "MDL", "2366", "615.60", "1750.40", "PARTIAL", -3, "overdue"), payment("future", "CO-FUTURE", "2026-09-09", "USD", "50", "0", "50", "OPEN", 3, "upcoming")],
      settled: [payment("settled", "CO-SETTLED", "2026-09-01", "MDL", "100", "100", "0", "SETTLED", -5, "settled")],
    };
    const { container } = render(<FinanceOverview locale="ro" overview={model} />);
    expect(screen.getByRole("heading", { name: "Calendar de plăți" })).toBeInTheDocument();
    expect(screen.getByText("CO-PARTIAL", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Achitat parțial/)).toBeInTheDocument();
    expect(screen.getByText(/În așteptarea plății/)).toBeInTheDocument();
    expect(screen.getAllByText("1.750,40 MDL").length).toBeGreaterThan(0);
    expect(screen.getByText(/nu sunt afișate/)).toBeInTheDocument();
    expect(screen.getByText(/Achitate/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Deschide comanda/ })[0]).toHaveAttribute("href", "/cabinet/orders?query=CO-PARTIAL");
    expect(container.querySelector("table")).toBeNull();
    expect(container.innerHTML).toContain("md:grid-cols-");
  });
});

function overview(state: Model["state"]): Model {
  return {
    summaries: [],
    contracts: [],
    synchronizedAt: null,
    state,
    showLastConfirmedNotice: false,
    paymentCalendar: {
      summaries: [], current: [], settled: [], freshness: "FINANCE_DATA_STALE",
      synchronizedAt: null, unavailableCount: 0,
    },
  };
}

function payment(id: string, orderNumber: string, dueDate: string, currency: string, plannedAmount: string, paidAmount: string, remainingAmount: string, paymentStatus: Model["paymentCalendar"]["current"][number]["paymentStatus"], daysFromDue: number, timing: Model["paymentCalendar"]["current"][number]["timing"]): Model["paymentCalendar"]["current"][number] {
  return {
    id, companyId: "company", oneCOrderId: crypto.randomUUID(), orderNumber, orderDate: "2026-09-01",
    oneCCounterpartyId: null, oneCContractId: null, oneCOrganizationId: null, scheduleLineNumber: 1,
    sourceOrderDataVersion: "v1", paymentPercent: "100", plannedAmount, vatAmount: "0", currency,
    dueDate, paymentMethod: "bank", bankAccountId: null, bankAccountName: null, paidAmount, remainingAmount,
    paymentStatus, settlementLastPaymentAt: null, orderPosted: true, orderDeletionMark: false, orderStatus: null,
    reconciliationStatus: "READY", unsupportedReason: null, sourceModifiedAt: null,
    sourceObservedAt: "2026-09-06T08:00:00Z", syncedAt: "2026-09-06T08:00:00Z", daysFromDue, timing,
  };
}
