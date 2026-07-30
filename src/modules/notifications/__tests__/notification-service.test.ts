import { describe, expect, it, vi } from "vitest";

import type { CompanyAccessService } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { NotificationRepository } from "../repositories";
import { NotificationAccessError, NotificationService } from "../services";

const notification = {
  id: "00000000-0000-4000-8000-000000000001",
  eventCode: "order_confirmed",
  eventGroup: "orders" as const,
  severity: "success" as const,
  mandatory: true,
  title: "Заказ подтверждён",
  message: "Заказ принят в работу.",
  actionLabel: "Открыть заказ",
  actionUrl: "/cabinet/orders/00000000-0000-4000-8000-000000000002",
  occurredAt: "2026-07-30T10:00:00Z",
  readAt: null,
  dismissedAt: null,
  expiresAt: "2026-10-30T10:00:00Z",
  relativeTime: "",
};

describe("NotificationService", () => {
  it("uses one bounded summary query and presents canonical relative time", async () => {
    const repository = createRepository();
    const service = new NotificationService(
      repository,
      createAccess(),
      () => new Date("2026-07-30T11:00:00Z"),
    );

    const result = await service.getSummary("user-1");

    expect(repository.getSummary).toHaveBeenCalledOnce();
    expect(repository.getSummary).toHaveBeenCalledWith("company-1", 8);
    expect(result.items[0]?.relativeTime).toContain("час");
  });

  it("fails closed without an active company membership", async () => {
    const access = createAccess();
    vi.mocked(access.getOwnMemberships).mockResolvedValue([]);
    const service = new NotificationService(createRepository(), access);
    await expect(service.getSummary("user-1")).rejects.toBeInstanceOf(NotificationAccessError);
  });

  it("does not perform entity lookups per notification", async () => {
    const repository = createRepository();
    vi.mocked(repository.getSummary).mockResolvedValue({
      unreadCount: 2,
      items: [notification, { ...notification, id: "00000000-0000-4000-8000-000000000003" }],
    });
    const access = createAccess();
    await new NotificationService(repository, access).getSummary("user-1");
    expect(access.getActiveCompanyContext).toHaveBeenCalledOnce();
    expect(repository.getSummary).toHaveBeenCalledOnce();
  });
});

function createRepository(): NotificationRepository {
  return {
    getSummary: vi.fn().mockResolvedValue({ unreadCount: 1, items: [notification] }),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    dismiss: vi.fn(),
    getPreferences: vi.fn(),
    setPreference: vi.fn(),
  };
}

function createAccess(): CompanyAccessService {
  return {
    getOwnMemberships: vi.fn().mockResolvedValue([
      { companyId: "company-1", status: MembershipStatus.Active },
    ]),
    getActiveCompanyContext: vi.fn().mockResolvedValue({
      company: { id: "company-1" },
    }),
    validateCompanyAccess: vi.fn(),
    ensureActiveMembership: vi.fn(),
  } as unknown as CompanyAccessService;
}
