import { describe, expect, it } from "vitest";

import type { PartnerWorkspaceContextService } from "../workspace-context.service";
import { DefaultWorkspaceHomeService } from "../workspace-home.service";
import { resolveWorkspaceCapabilities } from "../workspace-capability.service";

describe("DefaultWorkspaceHomeService", () => {
  it("builds a workflow dashboard without invented operational counts", async () => {
    const workspace = await new DefaultWorkspaceHomeService(fakeContextService()).getWorkspaceHome("partner-1");

    expect(workspace.company).toEqual({
      name: "Partner Company",
      role: "Partner Owner",
      external1cCode: "UU-001940",
      priceType: "GOLD",
      accountManager: null,
    });
    expect(workspace.quickActions.map((action) => action.label)).toEqual([
      "Создать проект",
      "Подобрать оборудование",
      "Создать спецификацию",
      "Сформировать КП",
      "Повторить заказ",
      "Зарегистрировать гарантийный случай",
    ]);
    expect(workspace.processCards).toHaveLength(6);
    expect(JSON.stringify(workspace)).not.toMatch(/activeOrders|openProjects|f7df2069|33333333/);
  });

  it("never labels an assigned partner status as unconfigured", async () => {
    const workspace = await new DefaultWorkspaceHomeService(fakeContextService({
      external1cPriceTypeId: "9adc073c-3eb5-11f0-8d8a-7239d3b7bd5c",
      priceTypeName: null,
    })).getWorkspaceHome("partner-1");

    expect(workspace.company.priceType).toBe("Назначен");
    expect(workspace.company.priceType).not.toBe("Не настроен");
  });
});

function fakeContextService(
  overrides: Partial<Awaited<ReturnType<PartnerWorkspaceContextService["getWorkspaceContext"]>>> = {},
): PartnerWorkspaceContextService {
  return {
    async getWorkspaceContext() {
      return {
        userId: "partner-1",
        userDisplayName: "Partner User",
        userEmail: "partner@example.com",
        profileStatus: "active",
        accessState: "active",
        companyId: "company-1",
        companyName: "Partner Company",
        companyStatus: "active",
        membershipId: "membership-1",
        membershipStatus: "active",
        membershipRole: "Partner Owner",
        external1cCode: "UU-001940",
        external1cPriceTypeId: "33333333-3333-4333-8333-333333333333",
        priceTypeName: "GOLD",
        capabilities: resolveWorkspaceCapabilities(new Set([
          "catalog.view",
          "prices.view",
          "stock.view",
          "orders.create",
          "documents.view_company",
        ])),
        ...overrides,
      };
    },
  };
}
