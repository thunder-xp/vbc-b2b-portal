import { z } from "zod";

import type {
  CommissionSourceAdjustmentDTO,
  CommissionSourceLineDTO,
  CommissionSourcePageResultDTO,
  CommissionSourcePaymentAllocationDTO,
  CommissionSourcePaymentDTO,
  CommissionSourceRealizationDTO,
} from "../dto";

const identifierSchema = z.string().trim().min(1).max(160);
const documentNumberSchema = z.string().trim().min(1).max(80);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime({ offset: true });
const sourceVersionSchema = z.string().trim().min(1).max(160);
const unsignedDecimalSchema = z
  .string()
  .regex(/^\d{1,18}(?:\.\d{1,4})?$/, "Expected a non-negative base-10 decimal string.");
const signedDecimalSchema = z
  .string()
  .regex(/^-?\d{1,18}(?:\.\d{1,4})?$/, "Expected a signed base-10 decimal string.");

export const commissionSourceDiagnosticsSchema = z
  .object({
    REALIZATIONS_READ: z.number().int().nonnegative(),
    LINES_READ: z.number().int().nonnegative(),
    PAYMENTS_READ: z.number().int().nonnegative(),
    ALLOCATIONS_READ: z.number().int().nonnegative(),
    ADJUSTMENTS_READ: z.number().int().nonnegative(),
    UNKNOWN_CLASSIFICATION: z.number().int().nonnegative(),
    UNMAPPED_CUSTOMER: z.number().int().nonnegative(),
    INVALID_ALLOCATION: z.number().int().nonnegative(),
    CURRENCY_CONFLICT: z.number().int().nonnegative(),
  })
  .strict();

const transactionFlagsSchema = z
  .object({
    tender: z.boolean(),
    subcontract: z.boolean(),
    specialPriceProject: z.boolean(),
    excluded: z.boolean(),
  })
  .strict();

export const commissionSourceLineSchema = z
  .object({
    sourceRealizationId: identifierSchema,
    sourceLineId: identifierSchema,
    sourceNomenclatureId: identifierSchema,
    quantity: unsignedDecimalSchema.refine((value) => toScaledInteger(value) > BigInt(0), {
      message: "Realization line quantity must be greater than zero.",
    }),
    grossAmount: unsignedDecimalSchema,
    discountAmount: unsignedDecimalSchema,
    netAmountBeforeVat: unsignedDecimalSchema,
    vatAmount: unsignedDecimalSchema,
    commissionClassification: z.enum([
      "EQUIPMENT",
      "NOVOTECH_INSTALLATION",
      "ELIGIBLE_SERVICE",
      "NONCOMMISSIONABLE",
    ]),
    transactionFlags: transactionFlagsSchema,
  })
  .strict()
  .superRefine((line, context) => {
    requireAmountEquation(
      line.grossAmount,
      line.netAmountBeforeVat,
      line.vatAmount,
      context,
      ["grossAmount"],
    );
  });

export const commissionSourceRealizationSchema = z
  .object({
    contractVersion: z.literal(1),
    sourceRealizationId: identifierSchema,
    sourceRealizationType: identifierSchema,
    sourceOrderId: identifierSchema.nullable(),
    sourceCustomer1cId: identifierSchema,
    organization1cId: identifierSchema,
    documentNumber: documentNumberSchema,
    documentDate: dateSchema,
    posted: z.boolean(),
    deletionMarked: z.boolean(),
    currency: currencySchema,
    grossTotal: unsignedDecimalSchema,
    netTotal: unsignedDecimalSchema,
    vatTotal: unsignedDecimalSchema,
    sourceVersion: sourceVersionSchema,
    lastModifiedAt: timestampSchema,
    lines: z.array(commissionSourceLineSchema).min(1),
  })
  .strict()
  .superRefine((realization, context) => {
    requireAmountEquation(
      realization.grossTotal,
      realization.netTotal,
      realization.vatTotal,
      context,
      ["grossTotal"],
    );

    validateUniqueIds(
      realization.lines.map((line) => line.sourceLineId),
      "Duplicate source line ID.",
      context,
      ["lines"],
    );

    for (const [index, line] of realization.lines.entries()) {
      if (line.sourceRealizationId !== realization.sourceRealizationId) {
        addIssue(context, "Line realization ID does not match its parent.", ["lines", index, "sourceRealizationId"]);
      }
    }

    requireAggregateEqual(
      realization.grossTotal,
      realization.lines.map((line) => line.grossAmount),
      "Realization gross total does not equal its line total.",
      context,
      ["grossTotal"],
    );
    requireAggregateEqual(
      realization.netTotal,
      realization.lines.map((line) => line.netAmountBeforeVat),
      "Realization net total does not equal its line total.",
      context,
      ["netTotal"],
    );
    requireAggregateEqual(
      realization.vatTotal,
      realization.lines.map((line) => line.vatAmount),
      "Realization VAT total does not equal its line total.",
      context,
      ["vatTotal"],
    );
  });

export const commissionSourcePaymentAllocationSchema = z
  .object({
    sourceAllocationId: identifierSchema,
    sourcePaymentId: identifierSchema,
    sourceRealizationId: identifierSchema,
    sourceLineId: identifierSchema,
    direction: z.enum(["APPLY", "REVERSE"]),
    currency: currencySchema,
    allocatedGrossAmount: unsignedDecimalSchema,
    allocatedNetAmountBeforeVat: unsignedDecimalSchema,
    allocatedVatAmount: unsignedDecimalSchema,
  })
  .strict()
  .superRefine((allocation, context) => {
    requireAmountEquation(
      allocation.allocatedGrossAmount,
      allocation.allocatedNetAmountBeforeVat,
      allocation.allocatedVatAmount,
      context,
      ["allocatedGrossAmount"],
    );
    if (toScaledInteger(allocation.allocatedGrossAmount) === BigInt(0)) {
      addIssue(context, "An allocation must have a positive gross amount.", ["allocatedGrossAmount"]);
    }
  });

export const commissionSourcePaymentSchema = z
  .object({
    contractVersion: z.literal(1),
    sourcePaymentId: identifierSchema,
    sourcePaymentType: z.enum([
      "BANK_RECEIPT",
      "CASH_RECEIPT",
      "BANK_REFUND",
      "CASH_REFUND",
      "PAYMENT_CORRECTION",
      "PAYMENT_CANCELLATION",
    ]),
    reversesSourcePaymentId: identifierSchema.nullable(),
    sourceCustomer1cId: identifierSchema,
    paymentDate: dateSchema,
    currency: currencySchema,
    paymentAmount: unsignedDecimalSchema,
    posted: z.boolean(),
    deletionMarked: z.boolean(),
    sourceVersion: sourceVersionSchema,
    lastModifiedAt: timestampSchema,
    allocations: z.array(commissionSourcePaymentAllocationSchema),
  })
  .strict()
  .superRefine((payment, context) => {
    validateUniqueIds(
      payment.allocations.map((allocation) => allocation.sourceAllocationId),
      "Duplicate source allocation ID.",
      context,
      ["allocations"],
    );

    const isReceipt = payment.sourcePaymentType === "BANK_RECEIPT" || payment.sourcePaymentType === "CASH_RECEIPT";
    const isReversal = payment.sourcePaymentType === "BANK_REFUND" || payment.sourcePaymentType === "CASH_REFUND" || payment.sourcePaymentType === "PAYMENT_CANCELLATION";

    if (isReversal && payment.reversesSourcePaymentId === null) {
      addIssue(context, "Refund and cancellation payments must identify the original payment.", ["reversesSourcePaymentId"]);
    }

    let allocatedGross = BigInt(0);
    for (const [index, allocation] of payment.allocations.entries()) {
      if (allocation.sourcePaymentId !== payment.sourcePaymentId) {
        addIssue(context, "Allocation payment ID does not match its parent.", ["allocations", index, "sourcePaymentId"]);
      }
      if (allocation.currency !== payment.currency) {
        addIssue(context, "Allocation currency does not match payment currency.", ["allocations", index, "currency"]);
      }
      if (isReceipt && allocation.direction !== "APPLY") {
        addIssue(context, "Receipt allocations must use APPLY direction.", ["allocations", index, "direction"]);
      }
      if (isReversal && allocation.direction !== "REVERSE") {
        addIssue(context, "Refund and cancellation allocations must use REVERSE direction.", ["allocations", index, "direction"]);
      }
      allocatedGross += toScaledInteger(allocation.allocatedGrossAmount);
    }

    if (allocatedGross > toScaledInteger(payment.paymentAmount)) {
      addIssue(context, "Allocated gross amount exceeds the payment amount.", ["allocations"]);
    }
  });

export const commissionSourceAdjustmentSchema = z
  .object({
    contractVersion: z.literal(1),
    sourceAdjustmentId: identifierSchema,
    adjustmentType: z.enum(["RETURN", "CORRECTION", "CANCELLATION"]),
    originalRealizationId: identifierSchema,
    originalLineId: identifierSchema,
    sourceCustomer1cId: identifierSchema,
    adjustmentDate: dateSchema,
    currency: currencySchema,
    grossDelta: signedDecimalSchema,
    netDelta: signedDecimalSchema,
    vatDelta: signedDecimalSchema,
    posted: z.boolean(),
    deletionMarked: z.boolean(),
    sourceVersion: sourceVersionSchema,
    lastModifiedAt: timestampSchema,
  })
  .strict()
  .superRefine((adjustment, context) => {
    requireAmountEquation(
      adjustment.grossDelta,
      adjustment.netDelta,
      adjustment.vatDelta,
      context,
      ["grossDelta"],
    );

    const grossDelta = toScaledInteger(adjustment.grossDelta);
    if (grossDelta === BigInt(0)) {
      addIssue(context, "An adjustment must have a non-zero gross delta.", ["grossDelta"]);
    }
    if (
      (adjustment.adjustmentType === "RETURN" || adjustment.adjustmentType === "CANCELLATION") &&
      (grossDelta > BigInt(0) ||
        toScaledInteger(adjustment.netDelta) > BigInt(0) ||
        toScaledInteger(adjustment.vatDelta) > BigInt(0))
    ) {
      addIssue(context, "Return and cancellation deltas must not be positive.", ["grossDelta"]);
    }
  });

export function parseCommissionSourceLine(input: unknown): CommissionSourceLineDTO {
  return commissionSourceLineSchema.parse(input);
}

export function parseCommissionSourceRealization(input: unknown): CommissionSourceRealizationDTO {
  return commissionSourceRealizationSchema.parse(input);
}

export function parseCommissionSourcePaymentAllocation(
  input: unknown,
): CommissionSourcePaymentAllocationDTO {
  return commissionSourcePaymentAllocationSchema.parse(input);
}

export function parseCommissionSourcePayment(input: unknown): CommissionSourcePaymentDTO {
  return commissionSourcePaymentSchema.parse(input);
}

export function parseCommissionSourceAdjustment(input: unknown): CommissionSourceAdjustmentDTO {
  return commissionSourceAdjustmentSchema.parse(input);
}

export function parseCommissionSourceRealizationPage(
  input: unknown,
): CommissionSourcePageResultDTO<CommissionSourceRealizationDTO> {
  return createPageSchema(commissionSourceRealizationSchema).parse(input);
}

export function parseCommissionSourcePaymentPage(
  input: unknown,
): CommissionSourcePageResultDTO<CommissionSourcePaymentDTO> {
  return createPageSchema(commissionSourcePaymentSchema).parse(input);
}

export function parseCommissionSourceAdjustmentPage(
  input: unknown,
): CommissionSourcePageResultDTO<CommissionSourceAdjustmentDTO> {
  return createPageSchema(commissionSourceAdjustmentSchema).parse(input);
}

function createPageSchema<TItem>(itemSchema: z.ZodType<TItem>) {
  return z
    .object({
      contractVersion: z.literal(1),
      snapshotAt: timestampSchema,
      items: z.array(itemSchema),
      nextCursor: z.string().min(1).nullable(),
      diagnostics: commissionSourceDiagnosticsSchema,
    })
    .strict();
}

function toScaledInteger(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const scaled = BigInt(`${whole}${fraction.padEnd(4, "0")}`);
  return negative ? -scaled : scaled;
}

function requireAmountEquation(
  gross: string,
  net: string,
  vat: string,
  context: z.core.$RefinementCtx,
  path: PropertyKey[],
): void {
  if (toScaledInteger(gross) !== toScaledInteger(net) + toScaledInteger(vat)) {
    addIssue(context, "Gross amount must equal net amount before VAT plus VAT amount.", path);
  }
}

function requireAggregateEqual(
  expected: string,
  values: string[],
  message: string,
  context: z.core.$RefinementCtx,
  path: PropertyKey[],
): void {
  const actual = values.reduce(
    (total, value) => total + toScaledInteger(value),
    BigInt(0),
  );
  if (actual !== toScaledInteger(expected)) addIssue(context, message, path);
}

function validateUniqueIds(
  ids: string[],
  message: string,
  context: z.core.$RefinementCtx,
  path: PropertyKey[],
): void {
  if (new Set(ids).size !== ids.length) addIssue(context, message, path);
}

function addIssue(
  context: z.core.$RefinementCtx,
  message: string,
  path: PropertyKey[],
): void {
  context.addIssue({ code: "custom", message, path });
}
