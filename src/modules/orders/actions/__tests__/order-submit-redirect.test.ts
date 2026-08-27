import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedUserId: vi.fn(),
  revalidatePath: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../access-control/actions/service-factory", () => ({
  createUserProfileService: vi.fn(),
  getAuthenticatedUserId: mocks.authenticatedUserId,
}));
vi.mock("../service-factory", () => ({
  createPartnerOrderHistoryService: vi.fn(),
  createPartnerOrderService: () => ({ submit: mocks.submit }),
}));

import {
  submitCartOrderAction,
} from "../order.actions";
import { partnerOrderRedirectTo } from "../../order-navigation";

const orderId = "11111111-1111-4111-8111-111111111111";

describe("confirmed checkout redirect contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId.mockResolvedValue("user-1");
    mocks.submit.mockResolvedValue({
      external1cNumber: "NSUU-001",
      id: orderId,
      status: "submitted",
    });
  });

  it.each(["cashless", "cash"] as const)(
    "returns the canonical confirmed order target for %s checkout",
    async (paymentMethod) => {
      const result = await submitCartOrderAction(
        { success: true, errorCode: null, message: "", data: null },
        checkoutForm(paymentMethod),
      );

      expect(result.success).toBe(true);
      expect(result.data?.redirectTo).toBe(
        `/cabinet/orders/${orderId}?submitted=1`,
      );
      expect(mocks.submit).toHaveBeenCalledOnce();
      expect(mocks.submit).toHaveBeenCalledWith("user-1", expect.objectContaining({
        paymentMethod,
      }));
    },
  );

  it("builds one stable canonical order detail URL", () => {
    expect(partnerOrderRedirectTo(orderId)).toBe(
      `/cabinet/orders/${orderId}?submitted=1`,
    );
  });
});

function checkoutForm(paymentMethod: "cashless" | "cash"): FormData {
  const form = new FormData();
  form.set("cartId", "22222222-2222-4222-8222-222222222222");
  form.set("expectedIntentVersion", "3");
  form.set("submissionKey", "33333333-3333-4333-8333-333333333333");
  form.set("requestedDeliveryDate", "2099-01-10");
  form.set("paymentDate", "2099-01-09");
  form.set("paymentMethod", paymentMethod);
  form.set("fulfillmentMethod", "pickup");
  return form;
}
