import { describe, expect, it } from "vitest";

import {
  normalizeOrderConfirmedEmailPayload,
  NotificationDeliveryError,
  orderConfirmedEmailSubject,
  renderOrderConfirmedEmail,
} from "../gateway";

const payload = {
  locale: "ru" as const,
  customerName: "Василий",
  companyName: "INNOVA SECURITY <trusted>",
  portalOrderId: "11111111-1111-4111-8111-111111111111",
  oneCOrderNumber: "NSUU-002351",
  orderDate: "2026-08-28T10:00:00.000Z",
  requestedDeliveryDate: "2026-08-28",
  confirmedDeliveryDate: "2026-08-28",
  paymentMethod: "cashless" as const,
  paymentCalendar: [{ date: "2026-08-31", amount: 372.06, currency: "USD" }],
  orderTotal: 372.06,
  currency: "USD",
  orderPath: "/cabinet/orders/11111111-1111-4111-8111-111111111111",
  manager: {
    name: "Анастасия Новак",
    phone: "+373 60 123 456",
    email: "manager@nsd.md",
  },
};

describe("order confirmation email template v2", () => {
  it("renders the exact localized subjects with and without confirmed shipment", () => {
    const ru = normalizeOrderConfirmedEmailPayload(payload, "https://www.nsd.md", 2);
    const ro = normalizeOrderConfirmedEmailPayload(
      { ...payload, locale: "ro" },
      "https://www.nsd.md",
      2,
    );
    expect(orderConfirmedEmailSubject(ru))
      .toBe("Заказ NSUU-002351 подтверждён — отгрузка 28 августа");
    expect(orderConfirmedEmailSubject(ro))
      .toBe("Comanda NSUU-002351 a fost confirmată — expediere 28 august");
    expect(orderConfirmedEmailSubject({
      ...ru,
      order: { ...ru.order, confirmedShipmentDate: null },
    })).toBe("Заказ NSUU-002351 подтверждён");
    expect(orderConfirmedEmailSubject({
      ...ro,
      order: { ...ro.order, confirmedShipmentDate: null },
    })).toBe("Comanda NSUU-002351 a fost confirmată");
  });

  it.each([
    ["ru", "✓ Заказ подтверждён", "Здравствуйте, Василий.", "Открыть заказ →",
      "Если дата или условия отгрузки изменятся, мы сообщим вам об этом заранее."],
    ["ro", "✓ Comanda a fost confirmată", "Bună ziua, Василий.", "Deschide comanda →",
      "Dacă data sau condițiile de expediere se modifică, vă vom informa din timp."],
  ] as const)("renders complete %s transactional content", (locale, status, greeting, cta, promise) => {
    const message = renderOrderConfirmedEmail(
      { ...payload, locale },
      "buyer@example.com",
      "https://www.nsd.md",
      2,
    );
    for (const expected of [
      status,
      greeting,
      "Novotech Systems",
      "NSUU-002351",
      "INNOVA SECURITY",
      "372,06 USD",
      "31.08.2026",
      cta,
      promise,
      "Анастасия Новак",
      "manager@nsd.md",
    ]) {
      expect(`${message.text}\n${message.html}`).toContain(expected);
    }
    expect(message.html).toContain("INNOVA SECURITY &lt;trusted&gt;");
    expect(message.html).toContain(
      'href="https://www.nsd.md/cabinet/orders/11111111-1111-4111-8111-111111111111"',
    );
    expect(message.text).toContain(
      "https://www.nsd.md/cabinet/orders/11111111-1111-4111-8111-111111111111",
    );
  });

  it("keeps authoritative commercial values identical between locales", () => {
    const ru = normalizeOrderConfirmedEmailPayload(payload, "https://www.nsd.md", 2);
    const ro = normalizeOrderConfirmedEmailPayload(
      { ...payload, locale: "ro" },
      "https://www.nsd.md",
      2,
    );
    expect(ro.order.totalAmount).toBe(ru.order.totalAmount);
    expect(ro.order.currency).toBe(ru.order.currency);
    expect(ro.order.confirmedShipmentDate).toBe(ru.order.confirmedShipmentDate);
    expect(ro.paymentSchedule).toEqual(ru.paymentSchedule);
  });

  it("degrades optional data without empty or technical output", () => {
    const message = renderOrderConfirmedEmail({
      ...payload,
      customerName: null,
      manager: null,
      confirmedDeliveryDate: null,
      paymentCalendar: [],
    }, "buyer@example.com", "https://www.nsd.md", 2);
    expect(message.subject).toBe("Заказ NSUU-002351 подтверждён");
    expect(message.text).toContain("Здравствуйте.");
    expect(message.text).toContain("Планируемая отгрузка");
    expect(message.text).toContain("info@nsd.md");
    expect(message.text).toContain("0 79 31 33 53");
    expect(message.text).not.toContain("Оплата:");
    expect(message.text).not.toContain("Ваш менеджер");
  });

  it("falls back to governed support when optional manager channels are malformed", () => {
    const message = renderOrderConfirmedEmail({
      ...payload,
      manager: { name: "Manager", phone: "---", email: "not-an-email" },
    }, "buyer@example.com", "https://www.nsd.md", 2);
    expect(message.text).toContain("Manager");
    expect(message.text).toContain("info@nsd.md");
    expect(message.text).toContain("0 79 31 33 53");
    expect(message.html).toContain("tel:+37379313353");
    expect(message.html).not.toContain("not-an-email");
  });

  it("never exposes internal system wording or unsafe placeholders", () => {
    const message = renderOrderConfirmedEmail(payload, "buyer@example.com", "https://www.nsd.md", 2);
    const output = `${message.subject}\n${message.text}\n${message.html}`;
    expect(output).not.toMatch(/1С|1C|undefined|null|Invalid Date/);
    expect(output).not.toMatch(/скидк|акци|recommend|newsletter/i);
    expect(message).not.toHaveProperty("attachment");
  });

  it("keeps legacy events deliverable without treating their requested date as confirmed", () => {
    const legacy = renderOrderConfirmedEmail(
      { ...payload, locale: undefined },
      "buyer@example.com",
      "https://www.nsd.md",
      1,
    );
    expect(legacy.subject).toBe("Заказ NSUU-002351 подтверждён");
    expect(legacy.text).toContain("Планируемая отгрузка");
    expect(legacy.text).not.toContain("Подтверждённая дата отгрузки");
  });

  it.each([
    { ...payload, orderDate: "not-a-date" },
    { ...payload, confirmedDeliveryDate: "2026-02-31" },
    { ...payload, orderPath: "http://localhost/order" },
    { ...payload, paymentCalendar: [{ date: "tomorrow", amount: 1, currency: "USD" }] },
  ])("rejects malformed governed payloads permanently", (invalidPayload) => {
    expect(() => renderOrderConfirmedEmail(invalidPayload, "buyer@example.com"))
      .toThrowError(NotificationDeliveryError);
    try {
      renderOrderConfirmedEmail(invalidPayload, "buyer@example.com");
    } catch (error) {
      expect(error).toMatchObject({ category: "invalid_payload", retryable: false });
    }
  });

  it("uses email-safe markup with a bounded mobile layout", () => {
    const message = renderOrderConfirmedEmail(payload, "buyer@example.com", "https://www.nsd.md", 2);
    expect(message.html).toContain('width="640"');
    expect(message.html).toContain("max-width:640px");
    expect(message.html).toContain("@media only screen and (max-width: 520px)");
    expect(message.html).not.toMatch(/display\s*:\s*grid|position\s*:\s*(fixed|sticky)|<script|<link/i);
  });
});
