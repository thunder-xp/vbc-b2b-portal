import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/src/lib/cron-auth", () => ({ authorizeCronRequest: mocks.authorize }));
vi.mock("@/src/modules/notifications/gateway", () => ({
  NotificationDeliveryWorkerService: class {
    run = mocks.run;
  },
  SmtpNotificationChannelAdapter: class {},
  SupabaseNotificationDeliveryRepository: class {},
}));

import { GET } from "../../../../app/api/cron/notification-deliveries/route";

describe("notification delivery cron route", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.authorize.mockResolvedValue({ authorized: true });
    mocks.run.mockResolvedValue({
      claimed: 1,
      sent: 1,
      failed: 0,
      deadLetter: 0,
      durationMs: 12,
      providerDurationMs: 8,
    });
  });

  it("rejects unauthenticated invocation before claiming work", async () => {
    mocks.authorize.mockResolvedValue({ authorized: false });
    const response = await GET(new Request("https://www.nsd.md/api/cron/notification-deliveries"));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs the bounded worker for an authorized cron", async () => {
    const response = await GET(new Request("https://www.nsd.md/api/cron/notification-deliveries"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(mocks.run).toHaveBeenCalledOnce();
  });
});
