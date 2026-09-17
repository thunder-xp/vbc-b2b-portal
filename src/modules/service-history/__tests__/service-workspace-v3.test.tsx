import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { PartnerWorkspaceTabs } from "../../partner-cabinet/components/PartnerWorkspaceTabs";
import { ServiceMonthlySummaryCard, UnifiedServiceHistoryList } from "../components";
import { normalizeServiceWorkspaceView, ServiceHistoryService } from "../service";
import type { ServiceMonthlySummary, UnifiedServiceHistoryPage } from "../types";

const pageSource = readFileSync(resolve(process.cwd(), "app/(partner)/cabinet/service/page.tsx"), "utf8");
const detailSource = readFileSync(resolve(process.cwd(), "app/(partner)/cabinet/service/history/[id]/page.tsx"), "utf8");

describe("B2B service workspace V3", () => {
  it("uses the shared accessible five-tab workspace primitive", () => {
    render(<PartnerWorkspaceTabs activeKey="active" ariaLabel="Service" tabs={[
      { key: "overview", label: "Обзор", href: "/cabinet/service?view=overview" },
      { key: "active", label: "В ремонте", href: "/cabinet/service?view=active" },
      { key: "completed", label: "Завершённые", href: "/cabinet/service?view=completed" },
      { key: "all", label: "Все документы", href: "/cabinet/service?view=all" },
      { key: "analytics", label: "Аналитика", href: "/cabinet/service?view=analytics" },
    ]} />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "В ремонте" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation")).toHaveClass("overflow-x-auto");
  });

  it("falls back invalid state to overview and preserves section context in links", () => {
    expect(normalizeServiceWorkspaceView("completed")).toBe("completed");
    expect(normalizeServiceWorkspaceView("unknown")).toBe("overview");
    render(<UnifiedServiceHistoryList locale="ru" page={history()} view="completed" />);
    expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute(
      "href",
      "/cabinet/service/history/11111111-1111-1111-1111-111111111111?from=completed",
    );
    expect(detailSource).toContain("/cabinet/service?view=${from}");
  });

  it("keeps month navigation inside Analytics", () => {
    render(<ServiceMonthlySummaryCard locale="ru" summary={summary()} view="analytics" />);
    expect(screen.getByLabelText("Предыдущий месяц")).toHaveAttribute(
      "href",
      "/cabinet/service?month=2026-08&view=analytics",
    );
  });

  it("loads only bounded data required by each workspace view", async () => {
    const repository = {
      getPartnerMonthSummary: vi.fn().mockResolvedValue(summary()),
      getPartnerAnalytics: vi.fn().mockResolvedValue({ month: "2026-09" }),
      listPartner: vi.fn().mockResolvedValue(history()),
    };
    const access = { getOwnMemberships: vi.fn().mockResolvedValue([{ status: "active", companyId: "22222222-2222-2222-2222-222222222222" }]) };
    const service = new ServiceHistoryService(repository as never, access as never);

    await service.getPartnerWorkspaceView("11111111-1111-1111-1111-111111111111", { view: "overview", month: "2026-09" });
    expect(repository.getPartnerAnalytics).not.toHaveBeenCalled();
    expect(repository.listPartner).toHaveBeenNthCalledWith(1, expect.objectContaining({ filter: "active", pageSize: 4 }));
    expect(repository.listPartner).toHaveBeenNthCalledWith(2, expect.objectContaining({ filter: "completed", pageSize: 4 }));

    vi.clearAllMocks();
    await service.getPartnerWorkspaceView("11111111-1111-1111-1111-111111111111", { view: "analytics", month: "2026-09" });
    expect(repository.getPartnerMonthSummary).toHaveBeenCalledOnce();
    expect(repository.getPartnerAnalytics).toHaveBeenCalledOnce();
    expect(repository.listPartner).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await service.getPartnerWorkspaceView("11111111-1111-1111-1111-111111111111", { view: "active", query: "NSUU" });
    expect(repository.listPartner).toHaveBeenCalledOnce();
    expect(repository.getPartnerMonthSummary).not.toHaveBeenCalled();
    expect(repository.getPartnerAnalytics).not.toHaveBeenCalled();
  });

  it("keeps company identity server-derived and does not render through live 1C", () => {
    expect(pageSource).not.toContain("company_id");
    expect(pageSource).not.toContain("OneCODataClient");
    expect(pageSource).toContain("getPartnerServiceWorkspaceViewAction");
  });
});

function summary(): ServiceMonthlySummary {
  return { month: "2026-09", previousMonth: "2026-08", nextMonth: null, unknownCurrencyCount: 0, currencies: [{ currency: "MDL", completedServiceCount: 2, totalServiceAmount: "500.00", totalVatAmount: "83.33" }] };
}

function history(): UnifiedServiceHistoryPage {
  return { page: 1, total: 1, items: [{
    id: "11111111-1111-1111-1111-111111111111", sourceType: "one_c", number: "NSUU-1", date: "2026-09-10T00:00:00Z", status: "issued_to_customer",
    productId: null, productSku: "100077", productName: "DH-HAP320", productImageUrl: null, productHref: null, maskedSerial: "123***789",
    reportedFault: null, workSummary: "Диагностика", serviceAmount: "250.00", vatAmount: "41.67", currency: "MDL", warrantyState: null,
    warrantyEndDate: null, updatedAt: "2026-09-10T00:00:00Z", href: "/cabinet/service/history/11111111-1111-1111-1111-111111111111",
  }] };
}
