import { describe, expect, it } from "vitest";

import {
  parseCommissionSourceAdjustment,
  parseCommissionSourcePayment,
  parseCommissionSourceRealization,
  parseCommissionSourceRealizationPage,
} from "../commission-source";

const realization = {
  contractVersion: 1,
  sourceRealizationId: "realization-1",
  sourceRealizationType: "GOODS_REALIZATION",
  sourceOrderId: "order-1",
  sourceCustomer1cId: "customer-1",
  organization1cId: "organization-1",
  documentNumber: "SYN-001",
  documentDate: "2026-09-13",
  posted: true,
  deletionMarked: false,
  currency: "MDL",
  grossTotal: "12000.00",
  netTotal: "10000.00",
  vatTotal: "2000.00",
  sourceVersion: "v1",
  lastModifiedAt: "2026-09-13T10:00:00+03:00",
  lines: [
    {
      sourceRealizationId: "realization-1",
      sourceLineId: "line-1",
      sourceNomenclatureId: "product-1",
      quantity: "1",
      grossAmount: "12000.00",
      discountAmount: "600.00",
      netAmountBeforeVat: "10000.00",
      vatAmount: "2000.00",
      commissionClassification: "EQUIPMENT",
      transactionFlags: {
        tender: false,
        subcontract: false,
        specialPriceProject: false,
        excluded: false,
      },
    },
  ],
};

describe("AgentCommissionSourceV1 validation", () => {
  it("accepts an exact realization with reconciled line totals", () => {
    expect(parseCommissionSourceRealization(realization)).toEqual(realization);
  });

  it("strictly validates the versioned page and aggregate diagnostics", () => {
    const page = {
      contractVersion: 1,
      snapshotAt: "2026-09-13T12:00:00+03:00",
      items: [realization],
      nextCursor: null,
      diagnostics: {
        REALIZATIONS_READ: 1,
        LINES_READ: 1,
        PAYMENTS_READ: 0,
        ALLOCATIONS_READ: 0,
        ADJUSTMENTS_READ: 0,
        UNKNOWN_CLASSIFICATION: 0,
        UNMAPPED_CUSTOMER: 0,
        INVALID_ALLOCATION: 0,
        CURRENCY_CONFLICT: 0,
      },
    };

    expect(parseCommissionSourceRealizationPage(page)).toEqual(page);
    expect(() =>
      parseCommissionSourceRealizationPage({
        ...page,
        diagnostics: { ...page.diagnostics, INVALID_ALLOCATION: -1 },
      }),
    ).toThrow();
  });

  it("rejects unknown fields and unknown commission classifications", () => {
    expect(() =>
      parseCommissionSourceRealization({
        ...realization,
        hiddenAccountingField: "must-not-cross-boundary",
      }),
    ).toThrow();

    expect(() =>
      parseCommissionSourceRealization({
        ...realization,
        lines: [{ ...realization.lines[0], commissionClassification: "INSTALLATION_BY_NAME" }],
      }),
    ).toThrow();
  });

  it("rejects inconsistent VAT and realization totals", () => {
    expect(() =>
      parseCommissionSourceRealization({
        ...realization,
        grossTotal: "12000.01",
      }),
    ).toThrow(/Gross amount|line total/);
  });

  it("supports partial and multiple payments with explicit line allocations", () => {
    const payment = {
      contractVersion: 1,
      sourcePaymentId: "payment-1",
      sourcePaymentType: "BANK_RECEIPT",
      reversesSourcePaymentId: null,
      sourceCustomer1cId: "customer-1",
      paymentDate: "2026-09-14",
      currency: "MDL",
      paymentAmount: "3600.00",
      posted: true,
      deletionMarked: false,
      sourceVersion: "v1",
      lastModifiedAt: "2026-09-14T10:00:00+03:00",
      allocations: [
        {
          sourceAllocationId: "allocation-1",
          sourcePaymentId: "payment-1",
          sourceRealizationId: "realization-1",
          sourceLineId: "line-1",
          direction: "APPLY",
          currency: "MDL",
          allocatedGrossAmount: "3600.00",
          allocatedNetAmountBeforeVat: "3000.00",
          allocatedVatAmount: "600.00",
        },
      ],
    };

    expect(parseCommissionSourcePayment(payment)).toEqual(payment);
  });

  it("rejects allocation overpayment and currency conflicts", () => {
    const basePayment = {
      contractVersion: 1,
      sourcePaymentId: "payment-1",
      sourcePaymentType: "BANK_RECEIPT",
      reversesSourcePaymentId: null,
      sourceCustomer1cId: "customer-1",
      paymentDate: "2026-09-14",
      currency: "MDL",
      paymentAmount: "100.00",
      posted: true,
      deletionMarked: false,
      sourceVersion: "v1",
      lastModifiedAt: "2026-09-14T10:00:00+03:00",
      allocations: [
        {
          sourceAllocationId: "allocation-1",
          sourcePaymentId: "payment-1",
          sourceRealizationId: "realization-1",
          sourceLineId: "line-1",
          direction: "APPLY",
          currency: "EUR",
          allocatedGrossAmount: "120.00",
          allocatedNetAmountBeforeVat: "100.00",
          allocatedVatAmount: "20.00",
        },
      ],
    };

    expect(() => parseCommissionSourcePayment(basePayment)).toThrow();
  });

  it("requires reverse direction and original payment on refunds", () => {
    expect(() =>
      parseCommissionSourcePayment({
        contractVersion: 1,
        sourcePaymentId: "refund-1",
        sourcePaymentType: "BANK_REFUND",
        reversesSourcePaymentId: null,
        sourceCustomer1cId: "customer-1",
        paymentDate: "2026-09-15",
        currency: "MDL",
        paymentAmount: "120.00",
        posted: true,
        deletionMarked: false,
        sourceVersion: "v1",
        lastModifiedAt: "2026-09-15T10:00:00+03:00",
        allocations: [],
      }),
    ).toThrow(/original payment/);
  });

  it("accepts signed correction deltas and rejects positive returns", () => {
    const adjustment = {
      contractVersion: 1,
      sourceAdjustmentId: "adjustment-1",
      adjustmentType: "RETURN",
      originalRealizationId: "realization-1",
      originalLineId: "line-1",
      sourceCustomer1cId: "customer-1",
      adjustmentDate: "2026-09-16",
      currency: "MDL",
      grossDelta: "-120.00",
      netDelta: "-100.00",
      vatDelta: "-20.00",
      posted: true,
      deletionMarked: false,
      sourceVersion: "v1",
      lastModifiedAt: "2026-09-16T10:00:00+03:00",
    };

    expect(parseCommissionSourceAdjustment(adjustment)).toEqual(adjustment);
    expect(() =>
      parseCommissionSourceAdjustment({
        ...adjustment,
        grossDelta: "120.00",
        netDelta: "100.00",
        vatDelta: "20.00",
      }),
    ).toThrow(/must not be positive/);
  });
});
