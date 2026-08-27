import { describe, expect, it } from "vitest";

import {
  NotificationDeliveryError,
  renderOrderRegisteredInOneCEmail,
} from "../gateway";

const payload = {
  companyName: "Partner SRL <trusted>",
  portalOrderId: "11111111-1111-4111-8111-111111111111",
  oneCOrderNumber: "NSUU-000123",
  orderDate: "2026-08-27T10:00:00.000Z",
  requestedDeliveryDate: "2026-08-30",
  confirmedDeliveryDate: "2026-08-30",
  paymentMethod: "cashless",
  paymentCalendar: [{ date: "2026-08-29", amount: 1250.5, currency: "MDL" }],
  orderTotal: 1250.5,
  currency: "MDL",
  orderPath: "/cabinet/orders/11111111-1111-4111-8111-111111111111",
};

describe("order registered email template v1", () => {
  it("renders authoritative order, dates, payment and portal link", () => {
    const message = renderOrderRegisteredInOneCEmail(
      payload,
      "buyer@example.com",
      "https://www.nsd.md",
    );
    expect(message.subject).toContain("NSUU-000123");
    expect(message.text).toContain("30.08.2026");
    expect(message.text).toContain("29.08.2026");
    expect(message.text).toContain("1 250,50 MDL");
    expect(message.text).toContain("https://www.nsd.md/cabinet/orders/11111111-1111-4111-8111-111111111111");
    expect(message.html).toContain("Partner SRL &lt;trusted&gt;");
    expect(message).not.toHaveProperty("attachment");
  });

  it("fails permanently when governed payload is incomplete", () => {
    expect(() => renderOrderRegisteredInOneCEmail(
      { ...payload, paymentCalendar: [{ date: "tomorrow", amount: 1, currency: "MDL" }] },
      "buyer@example.com",
    )).toThrowError(NotificationDeliveryError);
    try {
      renderOrderRegisteredInOneCEmail({}, "buyer@example.com");
    } catch (error) {
      expect(error).toMatchObject({ category: "invalid_payload", retryable: false });
    }
  });
});
