import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finance contract-balance scheduled route", () => {
  const route = readFileSync(resolve("app/api/cron/finance-contract-balances/route.ts"), "utf8");
  const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> };

  it("uses cron authentication and global overlap protection", () => {
    expect(route).toContain("isAuthorizedCronRequest(request)");
    expect(route).toContain('acquireSyncRunLock("scheduled_finance_contract_balances"');
    expect(route).toContain("createFinanceSyncCoordinator().synchronizeCompanies");
  });

  it("runs hourly and never synchronizes during page rendering", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/finance-contract-balances", schedule: "5 * * * *" });
    const page = readFileSync(resolve("app/(partner)/cabinet/finance/page.tsx"), "utf8");
    expect(page).not.toMatch(/OneC|synchronizeFinance|fetchContractBalances/);
  });

  it("keeps manual synchronization internal and accepts no 1C references", () => {
    const action = readFileSync(resolve("src/modules/finance/actions/sync-finance.action.ts"), "utf8");
    expect(action).toContain("createFinanceSyncAuthorizationService().ensureAllowed(userId)");
    expect(action).not.toMatch(/counterpartyRef|organizationRef/);
  });
});
