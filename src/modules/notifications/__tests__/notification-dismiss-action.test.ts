import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../access-control/actions/service-factory", () => ({
  getAuthenticatedUserId: async () => "user-1",
}));
vi.mock("../actions/service-factory", () => ({
  createNotificationService: () => ({ dismiss: mocks.dismiss }),
}));
vi.mock("../actions/notification-observability", () => ({ emitNotificationMetric: vi.fn() }));

import { dismissNotificationAction } from "../actions/notification.actions";

describe("dismissNotificationAction", () => {
  it("does not turn a successful governed mutation into a false failure when revalidation fails", async () => {
    mocks.dismiss.mockResolvedValue("2026-09-06T18:30:00.000Z");
    mocks.revalidatePath.mockImplementation(() => { throw new Error("cache unavailable"); });

    await expect(dismissNotificationAction("notification-1")).resolves.toMatchObject({
      success: true,
      data: "2026-09-06T18:30:00.000Z",
    });
    expect(mocks.dismiss).toHaveBeenCalledWith("user-1", "notification-1");
  });
});
