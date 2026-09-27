import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedUserId: vi.fn(),
  getPartnerLocale: vi.fn(),
  revalidatePath: vi.fn(),
  submit: vi.fn(),
  initiatePayment: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie }) }));
vi.mock("../../../access-control/actions/service-factory", () => ({
  createUserProfileService: vi.fn(),
  getAuthenticatedUserId: mocks.authenticatedUserId,
}));
vi.mock("../../../partner-locale/server", () => ({
  getPartnerLocale: mocks.getPartnerLocale,
}));
vi.mock("../service-factory", () => ({
  createPartnerOrderHistoryService: vi.fn(),
  createPartnerOrderService: () => ({ submit: mocks.submit }),
}));
vi.mock("../../../payments/server", () => ({
  createB2bPaymentService: () => ({ initiate: mocks.initiatePayment }),
  maibConfigurationSummary: () => ({ ready: true }),
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
    mocks.getPartnerLocale.mockResolvedValue("ro");
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
        notificationLocale: "ro",
      }));
    },
  );

  it("builds one stable canonical order detail URL", () => {
    expect(partnerOrderRedirectTo(orderId)).toBe(
      `/cabinet/orders/${orderId}?submitted=1`,
    );
  });

  it("creates the 1C-backed order before opening one governed MAIB checkout", async () => {
    mocks.initiatePayment.mockResolvedValue({
      outcome: "SUCCESS",
      paymentAttemptId: "44444444-4444-4444-8444-444444444444",
      checkoutUrl: "https://checkout.maib.md/session",
      returnAccessToken: "a".repeat(64),
      reused: false,
    });
    const form = checkoutForm("online");
    form.set("paymentDate", chisinauBusinessDate());
    const result = await submitCartOrderAction(
      { success: true, errorCode: null, message: "", data: null },
      form,
    );
    expect(mocks.submit).toHaveBeenCalledWith("user-1", expect.objectContaining({
      paymentMethod: "cashless",
      paymentDate: chisinauBusinessDate(),
    }));
    expect(mocks.initiatePayment).toHaveBeenCalledWith({
      partnerOrderId: orderId,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      locale: "ro",
    });
    expect(result.data?.redirectTo).toBe("https://checkout.maib.md/session");
    expect(mocks.setCookie).toHaveBeenCalledOnce();
  });

  it("keeps the created B2B order successful when checkout initiation fails", async () => {
    mocks.initiatePayment.mockRejectedValue(new Error("provider unavailable"));
    const form = checkoutForm("online");
    form.set("paymentDate", chisinauBusinessDate());
    const result = await submitCartOrderAction(
      { success: true, errorCode: null, message: "", data: null }, form,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: orderId,
      paymentInitiationOutcome: "CONFIGURATION_ERROR",
      redirectTo: `/cabinet/orders/${orderId}?submitted=1&payment=configuration_error`,
    });
  });
});

function checkoutForm(paymentMethod: "cashless" | "cash" | "online"): FormData {
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

function chisinauBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "Europe/Chisinau", year: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
