import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  confirmPayout: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/src/modules/admin", () => ({ requireAdminPermission: mocks.requireAdminPermission }));
vi.mock("../service", () => ({
  createAgentCommercialService: () => ({ confirmPayout: mocks.confirmPayout }),
}));

import { confirmAgentRewardPayoutAction } from "../actions";

const SALE_LINK_ID = "11000000-0000-4000-8000-000000000001";
const ADMIN_ID = "11000000-0000-4000-8000-000000000002";
const IDEMPOTENCY_KEY = "11000000-0000-4000-8000-000000000003";

describe("Agent reward payout action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({ userId: ADMIN_ID });
    mocks.confirmPayout.mockResolvedValue({ outcome: "APPLIED", state: "PAID" });
  });

  it("derives the actor from the Finance session and never accepts an amount", async () => {
    const data = payoutForm();
    data.set("amount", "999999.00");
    const result = await confirmAgentRewardPayoutAction({ status: "idle", message: "" }, data);

    expect(result.status).toBe("success");
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith("admin.agent_rewards.approve");
    expect(mocks.confirmPayout).toHaveBeenCalledWith({
      saleLinkId: SALE_LINK_ID,
      actorUserId: ADMIN_ID,
      expectedUpdatedAt: "2026-09-26T05:00:00.000Z",
      idempotencyKey: IDEMPOTENCY_KEY,
      payoutReference: "PAY-2026-001",
      note: "Bank document",
    });
    expect(mocks.confirmPayout.mock.calls[0]?.[0]).not.toHaveProperty("amount");
  });

  it("returns a readable conflict and does not retry a stale payout", async () => {
    mocks.confirmPayout.mockRejectedValue(new Error("REWARD_PAYOUT_CONFLICT"));
    const result = await confirmAgentRewardPayoutAction({ status: "idle", message: "" }, payoutForm());
    expect(result).toEqual({ status: "error", message: "Вознаграждение уже изменено другим пользователем. Обновите страницу." });
    expect(mocks.confirmPayout).toHaveBeenCalledTimes(1);
  });

  it("does not reach payout when authorization fails", async () => {
    mocks.requireAdminPermission.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(confirmAgentRewardPayoutAction({ status: "idle", message: "" }, payoutForm())).rejects.toThrow("FORBIDDEN");
    expect(mocks.confirmPayout).not.toHaveBeenCalled();
  });

  it("requires an explicit payout confirmation", async () => {
    const data = payoutForm();
    data.delete("confirmPayout");
    const result = await confirmAgentRewardPayoutAction({ status: "idle", message: "" }, data);
    expect(result.status).toBe("error");
    expect(mocks.confirmPayout).not.toHaveBeenCalled();
  });
});

function payoutForm() {
  const data = new FormData();
  data.set("saleLinkId", SALE_LINK_ID);
  data.set("expectedUpdatedAt", "2026-09-26T05:00:00.000Z");
  data.set("idempotencyKey", IDEMPOTENCY_KEY);
  data.set("payoutReference", "PAY-2026-001");
  data.set("note", "Bank document");
  data.set("confirmPayout", "on");
  return data;
}
