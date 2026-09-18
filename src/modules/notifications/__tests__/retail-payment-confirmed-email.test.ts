import { describe, expect, it } from "vitest";
import { renderRetailPaymentConfirmedEmail } from "../gateway/retail-payment-confirmed.email";
import type { ClaimedNotificationDelivery } from "../gateway/types";

describe("retail payment confirmation email", () => {
  it("renders the required authoritative RU fields without card data", () => {
    const message = renderRetailPaymentConfirmedEmail(delivery("ru"));
    expect(message.subject).toContain("R-2026-000001");
    expect(message.text.replace(/\s/g, " ")).toContain("1 250,50");
    expect(message.text).toContain("CAM-1 — Camera × 2");
    expect(message.text).toContain("NOVOTECH SYSTEMS S.R.L. · www.nsd.md");
    expect(message.text).not.toMatch(/PAN|CVV|RRN|access token/i);
  });

  it("renders the same factual RO contract", () => {
    const message = renderRetailPaymentConfirmedEmail(delivery("ro"));
    expect(message.subject).toContain("Plata comenzii");
    expect(message.text).toContain("Produse:");
  });
});

function delivery(locale: "ru" | "ro"): ClaimedNotificationDelivery {
  return {
    deliveryId: "10000000-0000-4000-8000-000000000001", eventId: "10000000-0000-4000-8000-000000000002",
    eventType: "retail.payment_confirmed", companyId: null, partnerOrderId: null, correlationId: "10000000-0000-4000-8000-000000000003",
    payloadVersion: 1, payload: {}, channel: "email", recipient: "buyer@example.com", recipientLocale: locale,
    templateVersion: 1, attempt: 1, leaseToken: "10000000-0000-4000-8000-000000000004", idempotencyKey: "idempotent",
    renderedSnapshot: { orderNumber: "R-2026-000001", merchantName: "NOVOTECH SYSTEMS S.R.L.", website: "www.nsd.md", amount: 1250.5,
      currency: "MDL", confirmedAt: "2026-09-18T10:00:00.000Z", locale, items: [{ name: "Camera", sku: "CAM-1", quantity: 2 }] },
  };
}
