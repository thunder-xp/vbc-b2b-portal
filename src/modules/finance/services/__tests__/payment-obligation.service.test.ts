import { describe, expect, it } from "vitest";

import type { PaymentObligationSourceDTO } from "../../../integration/dto";
import { reconcilePaymentObligations } from "../payment-obligation.service";

const observedAt = "2026-09-06T08:00:00.000Z";

describe("reconcilePaymentObligations", () => {
  it("publishes a proven one-line calendar with source provenance and authoritative due amounts", () => {
    const result = reconcilePaymentObligations([source()], observedAt);
    expect(result.exclusions).toEqual([]);
    expect(result.obligations).toEqual([expect.objectContaining({
      oneCOrderId: ids.order,
      scheduleLineNumber: 1,
      sourceOrderDataVersion: "version-1",
      dueDate: "2026-09-09",
      paymentPercent: "100.0000",
      plannedAmount: "2366.0000",
      vatAmount: "394.3300",
      currency: "MDL",
      paidAmount: "0.0000",
      remainingAmount: "2366.0000",
      paymentStatus: "OPEN",
      reconciliationStatus: "READY",
    })]);
  });

  it("uses authoritative remaining balance and distinguishes partial and full settlement", () => {
    const partial = reconcilePaymentObligations([source({ paidAmount: 615.6, remainingAmount: 1750.4 })], observedAt).obligations[0];
    const settled = reconcilePaymentObligations([source({ paidAmount: 2366, remainingAmount: 0, latestPaymentAt: "2026-09-05T11:00:00Z" })], observedAt).obligations[0];
    expect(partial).toMatchObject({ paymentStatus: "PARTIAL", paidAmount: "615.6000", remainingAmount: "1750.4000" });
    expect(settled).toMatchObject({ paymentStatus: "SETTLED", remainingAmount: "0.0000", settlementLastPaymentAt: "2026-09-05T11:00:00Z" });
  });

  it("reopens a settled obligation when a reversed payment disappears from current 1C truth", () => {
    const settled = reconcilePaymentObligations([source({ paidAmount: 2366, remainingAmount: 0, latestPaymentAt: "2026-09-05T11:00:00Z" })], observedAt).obligations[0];
    const reopened = reconcilePaymentObligations([source({ paidAmount: 0, remainingAmount: 2366, latestPaymentAt: null, sourceOrderDataVersion: "version-2" })], observedAt).obligations[0];
    expect(settled.paymentStatus).toBe("SETTLED");
    expect(reopened).toMatchObject({ paymentStatus: "OPEN", sourceOrderDataVersion: "version-2", settlementLastPaymentAt: null });
  });

  it.each([
    [[], "PAYMENT_CALENDAR_EMPTY"],
    [[calendar(), { ...calendar(), lineNumber: 2 }], "MULTI_LINE_SCHEDULE_UNSUPPORTED"],
  ] as const)("fails closed for unsupported calendar cardinality", (calendarRows, reason) => {
    const result = reconcilePaymentObligations([source({ calendarRows: [...calendarRows] })], observedAt);
    expect(result.obligations).toEqual([]);
    expect(result.exclusions).toEqual([expect.objectContaining({ reason, scheduleLineCount: calendarRows.length })]);
  });

  it.each([
    [{ orderPosted: false }, "ORDER_UNPOSTED"],
    [{ orderDeletionMarked: true }, "ORDER_DELETED"],
    [{ counterpartyReference: null }, "COMPANY_UNRESOLVED"],
    [{ contractReference: null }, "CONTRACT_UNRESOLVED"],
    [{ orderCurrencyReference: null }, "CURRENCY_UNRESOLVED"],
    [{ contractCurrencyCode: "USD" }, "CURRENCY_MISMATCH"],
    [{ remainingAmount: null }, "SETTLEMENT_UNRESOLVED"],
  ] as const)("marks invalid source truth unsupported", (change, reason) => {
    const obligation = reconcilePaymentObligations([source(change)], observedAt).obligations[0];
    expect(obligation).toMatchObject({ reconciliationStatus: "UNSUPPORTED", unsupportedReason: reason });
  });

  it("marks arithmetic drift non-reconciling without replacing the authoritative balance", () => {
    const obligation = reconcilePaymentObligations([source({ paidAmount: 600, remainingAmount: 1700 })], observedAt).obligations[0];
    expect(obligation).toMatchObject({
      reconciliationStatus: "NON_RECONCILING",
      unsupportedReason: "AMOUNT_NON_RECONCILING",
      remainingAmount: "1700.0000",
    });
  });
});

const ids = {
  order: "11111111-1111-4111-8111-111111111111",
  counterparty: "22222222-2222-4222-8222-222222222222",
  contract: "33333333-3333-4333-8333-333333333333",
  organization: "44444444-4444-4444-8444-444444444444",
  currency: "55555555-5555-4555-8555-555555555555",
};

function calendar() {
  return { lineNumber: 1, dueDate: "2026-09-09", paymentPercent: 100, plannedAmount: 2366, vatAmount: 394.33 };
}

function source(change: Partial<PaymentObligationSourceDTO> = {}): PaymentObligationSourceDTO {
  return {
    orderReference: ref(ids.order, "order"), orderNumber: "CO-100", orderDate: "2026-09-01",
    counterpartyReference: ref(ids.counterparty, "counterparty"), contractReference: ref(ids.contract, "contract"),
    organizationReference: ref(ids.organization, "organization"), sourceOrderDataVersion: "version-1",
    sourceModifiedAt: "2026-09-05T10:00:00Z", orderPosted: true, orderDeletionMarked: false,
    orderStatus: "accepted", paymentMethod: "bank", bankAccountReference: null, bankAccountName: null,
    orderCurrencyReference: ref(ids.currency, "currency"), orderCurrencyCode: "MDL",
    contractCurrencyReference: ref(ids.currency, "currency"), contractCurrencyCode: "MDL",
    calendarRows: [calendar()], paidAmount: 0, remainingAmount: 2366, latestPaymentAt: null, allocations: [],
    ...change,
  };
}

function ref(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}
