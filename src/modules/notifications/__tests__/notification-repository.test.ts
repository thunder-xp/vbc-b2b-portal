import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));

import { SupabaseNotificationRepository } from "../repositories";

describe("SupabaseNotificationRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the typed atomic mark-all v2 RPC", async () => {
    const data = {
      affectedCount: 3,
      unreadCount: 0,
      correlationId: "00000000-0000-4000-8000-000000000099",
      markedAt: "2026-08-03T12:00:00Z",
    };
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(new SupabaseNotificationRepository().markAllRead(
      "00000000-0000-4000-8000-000000000010",
    )).resolves.toEqual(data);
    expect(mocks.rpc).toHaveBeenCalledWith("mark_all_partner_notifications_read_v2", {
      p_company_id: "00000000-0000-4000-8000-000000000010",
    });
  });

  it("accepts the commercial event group already supported by the database", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        unreadCount: 1,
        items: [{
          id: "00000000-0000-4000-8000-000000000001",
          eventCode: "campaign_ending_soon",
          eventGroup: "commercial",
          severity: "information",
          mandatory: false,
          title: "Предложение скоро завершится",
          message: "Проверьте условия предложения.",
          actionLabel: "Открыть",
          actionUrl: "/cabinet/offers",
          occurredAt: "2026-08-03T12:00:00Z",
          readAt: null,
          dismissedAt: null,
          expiresAt: "2026-08-10T12:00:00Z",
        }],
      },
      error: null,
    });

    await expect(new SupabaseNotificationRepository().getSummary(
      "00000000-0000-4000-8000-000000000010",
    )).resolves.toMatchObject({ items: [{ eventGroup: "commercial" }] });
  });
});
