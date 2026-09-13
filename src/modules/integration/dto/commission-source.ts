import type { IntegrationPageResultDTO } from "./common";

export const COMMISSION_SOURCE_CONTRACT_VERSION = 1 as const;

export type CommissionSourceContractVersion =
  typeof COMMISSION_SOURCE_CONTRACT_VERSION;

export type CommissionSourceLineClassification =
  | "EQUIPMENT"
  | "NOVOTECH_INSTALLATION"
  | "ELIGIBLE_SERVICE"
  | "NONCOMMISSIONABLE";

export type CommissionSourcePaymentType =
  | "BANK_RECEIPT"
  | "CASH_RECEIPT"
  | "BANK_REFUND"
  | "CASH_REFUND"
  | "PAYMENT_CORRECTION"
  | "PAYMENT_CANCELLATION";

export type CommissionSourceAllocationDirection = "APPLY" | "REVERSE";

export type CommissionSourceAdjustmentType =
  | "RETURN"
  | "CORRECTION"
  | "CANCELLATION";

/**
 * Exact base-10 amount serialized without exponent notation. Four fractional
 * digits preserve source precision; currency rounding stays owned by 1C.
 */
export type CommissionSourceDecimal = string;

export type CommissionSourceTransactionFlagsDTO = {
  tender: boolean;
  subcontract: boolean;
  specialPriceProject: boolean;
  excluded: boolean;
};

export type CommissionSourceLineDTO = {
  sourceRealizationId: string;
  sourceLineId: string;
  sourceNomenclatureId: string;
  quantity: CommissionSourceDecimal;
  grossAmount: CommissionSourceDecimal;
  discountAmount: CommissionSourceDecimal;
  netAmountBeforeVat: CommissionSourceDecimal;
  vatAmount: CommissionSourceDecimal;
  commissionClassification: CommissionSourceLineClassification;
  transactionFlags: CommissionSourceTransactionFlagsDTO;
};

export type CommissionSourceRealizationDTO = {
  contractVersion: CommissionSourceContractVersion;
  sourceRealizationId: string;
  sourceRealizationType: string;
  sourceOrderId: string | null;
  sourceCustomer1cId: string;
  organization1cId: string;
  documentNumber: string;
  documentDate: string;
  posted: boolean;
  deletionMarked: boolean;
  currency: string;
  grossTotal: CommissionSourceDecimal;
  netTotal: CommissionSourceDecimal;
  vatTotal: CommissionSourceDecimal;
  sourceVersion: string;
  lastModifiedAt: string;
  lines: CommissionSourceLineDTO[];
};

export type CommissionSourcePaymentAllocationDTO = {
  sourceAllocationId: string;
  sourcePaymentId: string;
  sourceRealizationId: string;
  sourceLineId: string;
  direction: CommissionSourceAllocationDirection;
  currency: string;
  allocatedGrossAmount: CommissionSourceDecimal;
  allocatedNetAmountBeforeVat: CommissionSourceDecimal;
  allocatedVatAmount: CommissionSourceDecimal;
};

export type CommissionSourcePaymentDTO = {
  contractVersion: CommissionSourceContractVersion;
  sourcePaymentId: string;
  sourcePaymentType: CommissionSourcePaymentType;
  reversesSourcePaymentId: string | null;
  sourceCustomer1cId: string;
  paymentDate: string;
  currency: string;
  paymentAmount: CommissionSourceDecimal;
  posted: boolean;
  deletionMarked: boolean;
  sourceVersion: string;
  lastModifiedAt: string;
  allocations: CommissionSourcePaymentAllocationDTO[];
};

export type CommissionSourceAdjustmentDTO = {
  contractVersion: CommissionSourceContractVersion;
  sourceAdjustmentId: string;
  adjustmentType: CommissionSourceAdjustmentType;
  originalRealizationId: string;
  originalLineId: string;
  sourceCustomer1cId: string;
  adjustmentDate: string;
  currency: string;
  grossDelta: CommissionSourceDecimal;
  netDelta: CommissionSourceDecimal;
  vatDelta: CommissionSourceDecimal;
  posted: boolean;
  deletionMarked: boolean;
  sourceVersion: string;
  lastModifiedAt: string;
};

export type CommissionSourceDiagnosticsDTO = {
  REALIZATIONS_READ: number;
  LINES_READ: number;
  PAYMENTS_READ: number;
  ALLOCATIONS_READ: number;
  ADJUSTMENTS_READ: number;
  UNKNOWN_CLASSIFICATION: number;
  UNMAPPED_CUSTOMER: number;
  INVALID_ALLOCATION: number;
  CURRENCY_CONFLICT: number;
};

export type CommissionSourcePageResultDTO<TItem> =
  IntegrationPageResultDTO<TItem> & {
    contractVersion: CommissionSourceContractVersion;
    snapshotAt: string;
    diagnostics: CommissionSourceDiagnosticsDTO;
  };
