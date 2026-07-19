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
    model.contracts = [{ id: "b", companyId: "c", externalContractRef: "r", contractNumber: "NS-1", contractName: "NS-1", currencyRef: "m", currencyCode: "MDL", signedBalance: "100", sourceVersion: null, synchronizedAt: new Date().toISOString(), balanceType: "receivable", absoluteDisplayAmount: "100.00" }];
    model.summaries = [{ currencyCode: "MDL", receivableTotal: "100.00", advanceTotal: "0.00" }];
    model.showLastConfirmedNotice = true;
    render(<FinanceOverview overview={model} />);
    expect(screen.getByText("Показаны последние подтверждённые данные")).toBeInTheDocument();
    expect(screen.getByText("NS-1")).toBeInTheDocument();
  });
});

function overview(state: Model["state"]): Model {
  return { summaries: [], contracts: [], synchronizedAt: null, state, showLastConfirmedNotice: false };
}
