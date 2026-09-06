import Decimal from "decimal.js";

import type { PaymentObligationSourceDTO } from "../../integration/dto";
import type {
  PaymentObligationExclusion,
  PaymentObligationUnsupportedReason,
  PaymentStatus,
  PublishPaymentObligation,
} from "../types";

export type ReconciledPaymentObligationSnapshot = {
  obligations: PublishPaymentObligation[];
  exclusions: PaymentObligationExclusion[];
};

export function reconcilePaymentObligations(
  source: PaymentObligationSourceDTO[],
  sourceObservedAt: string,
): ReconciledPaymentObligationSnapshot {
  const obligations: PublishPaymentObligation[] = [];
  const exclusions: PaymentObligationExclusion[] = [];
  for (const order of source) {
    if (order.calendarRows.length !== 1) {
      exclusions.push({
        oneCOrderId: order.orderReference.externalId,
        orderNumber: order.orderNumber,
        sourceOrderDataVersion: order.sourceOrderDataVersion,
        scheduleLineCount: order.calendarRows.length,
        reason: order.calendarRows.length === 0 ? "PAYMENT_CALENDAR_EMPTY" : "MULTI_LINE_SCHEDULE_UNSUPPORTED",
        sourceObservedAt,
      });
      continue;
    }

    const calendar = order.calendarRows[0];
    const unsupportedReason = unsupported(order);
    const amounts = monetaryState(calendar.plannedAmount, order.paidAmount, order.remainingAmount);
    const reconciliationStatus = unsupportedReason
      ? "UNSUPPORTED" as const
      : !amounts.resolved
        ? "UNSUPPORTED" as const
        : amounts.reconciles
          ? "READY" as const
          : "NON_RECONCILING" as const;
    const reason: PaymentObligationUnsupportedReason | null = unsupportedReason
      ?? (!amounts.resolved ? "SETTLEMENT_UNRESOLVED" : !amounts.reconciles ? "AMOUNT_NON_RECONCILING" : null);
    const paymentStatus = amounts.status;

    obligations.push({
      oneCOrderId: order.orderReference.externalId,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      oneCCounterpartyId: order.counterpartyReference?.externalId ?? null,
      oneCContractId: order.contractReference?.externalId ?? null,
      oneCOrganizationId: order.organizationReference?.externalId ?? null,
      scheduleLineNumber: calendar.lineNumber,
      sourceOrderDataVersion: order.sourceOrderDataVersion,
      paymentPercent: money(calendar.paymentPercent),
      plannedAmount: money(calendar.plannedAmount),
      vatAmount: money(calendar.vatAmount),
      currency: order.orderCurrencyCode ?? "UNRESOLVED",
      dueDate: calendar.dueDate,
      paymentMethod: order.paymentMethod,
      bankAccountId: order.bankAccountReference?.externalId ?? null,
      bankAccountName: order.bankAccountName,
      paidAmount: money(order.paidAmount),
      remainingAmount: money(order.remainingAmount ?? 0),
      paymentStatus,
      settlementLastPaymentAt: paymentStatus === "SETTLED" && amounts.reconciles ? order.latestPaymentAt : null,
      orderPosted: order.orderPosted,
      orderDeletionMark: order.orderDeletionMarked,
      orderStatus: order.orderStatus,
      reconciliationStatus,
      unsupportedReason: reason,
      sourceModifiedAt: order.sourceModifiedAt,
      sourceObservedAt,
      syncedAt: sourceObservedAt,
    });
  }
  return { obligations, exclusions };
}

function unsupported(order: PaymentObligationSourceDTO): PaymentObligationUnsupportedReason | null {
  if (!order.counterpartyReference || !order.organizationReference) return "COMPANY_UNRESOLVED";
  if (!order.contractReference) return "CONTRACT_UNRESOLVED";
  if (order.orderDeletionMarked) return "ORDER_DELETED";
  if (!order.orderPosted) return "ORDER_UNPOSTED";
  if (!order.orderCurrencyReference || !order.contractCurrencyReference
    || !order.orderCurrencyCode || !order.contractCurrencyCode) return "CURRENCY_UNRESOLVED";
  if (order.orderCurrencyReference.externalId !== order.contractCurrencyReference.externalId
    || order.orderCurrencyCode !== order.contractCurrencyCode) return "CURRENCY_MISMATCH";
  return null;
}

function monetaryState(planned: number, paid: number, remaining: number | null): {
  resolved: boolean;
  reconciles: boolean;
  status: PaymentStatus;
} {
  const plannedValue = decimal(planned);
  const paidValue = decimal(paid);
  const remainingValue = remaining === null ? null : decimal(remaining);
  if (!plannedValue || !paidValue || !remainingValue || plannedValue.isNegative()
    || paidValue.isNegative() || remainingValue.isNegative()) {
    return { resolved: false, reconciles: false, status: "OPEN" };
  }
  const reconciles = plannedValue.minus(paidValue.plus(remainingValue)).abs().lessThan("0.005");
  const status: PaymentStatus = remainingValue.lessThanOrEqualTo("0.0049")
    ? "SETTLED"
    : paidValue.greaterThanOrEqualTo("0.005") ? "PARTIAL" : "OPEN";
  return { resolved: true, reconciles, status };
}

function decimal(value: number): Decimal | null {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function money(value: number): string {
  const parsed = decimal(value);
  return parsed ? parsed.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4) : "0.0000";
}
