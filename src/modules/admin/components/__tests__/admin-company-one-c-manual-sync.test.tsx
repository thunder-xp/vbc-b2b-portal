import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminCompanyOverview, AdminOneCManualSyncDiscovery } from "../../types";

const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("../../actions", () => ({
  discoverAdminCompanyOneCSyncAction: "discover",
  applyAdminCompanyOneCSyncAction: "apply",
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (action: string) => [action === "discover" ? mocks.state : {}, vi.fn(), false],
}));

import { AdminCompanyOneCManualSync } from "../AdminCompanyOneCManualSync";

describe("manual 1C discovery review", () => {
  it("shows an unavailable non-NS contract and permits main-only confirmation", () => {
    mocks.state = {
      status: "discovered",
      discovery: {
        counterparty: { name: "ADALIS", code: "UU-002011", reference: "owner" },
        verifiedAt: "2026-10-14T00:00:00Z",
        previous: { mainContractRef: null, cashContractRef: null, priceTypeRef: null, readiness: "BLOCKED" },
        proposed: { mainContractRef: "main", cashContractRef: null, priceTypeRef: "silver" },
        errors: ["PRICE_TYPE_NOT_DEFINED"],
        canApply: true,
        candidates: [
          { contractRef: "main", name: "Main", number: "NS-1", nsCandidate: true, cashDisplayCandidate: true, eligible: true, priceTypeActive: true, priceTypeName: "SILVER", priceTypeRef: "silver" },
          { contractRef: "invalid-other", name: "Invalid other", number: "OTHER-1", nsCandidate: false, cashDisplayCandidate: false, eligible: false, priceTypeActive: false, priceTypeName: null, priceTypeRef: "broken", blockingCode: "PRICE_TYPE_NOT_DEFINED" },
        ],
      } as AdminOneCManualSyncDiscovery,
    };
    render(<AdminCompanyOneCManualSync company={{ companyId: "company", external1cId: "owner" } as AdminCompanyOverview} events={[]} />);
    const cash = screen.getByRole("group", { name: "Наличный договор — отдельное назначение администратора" });
    expect(within(cash).getByText(/Invalid other/)).toBeVisible();
    expect(within(cash).getByText("PRICE_TYPE_NOT_DEFINED")).toBeVisible();
    const preserve = within(cash).getByRole("radio", { name: "Сохранить текущее наличное сопоставление без изменений" });
    expect(preserve).toBeChecked();
    expect(preserve).not.toBeRequired();
    expect(screen.getByRole("button", { name: "Подтвердить и применить" })).toBeEnabled();
  });
});
