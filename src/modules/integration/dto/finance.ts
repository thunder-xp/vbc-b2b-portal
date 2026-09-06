import type {
  ExternalReferenceDTO,
  IntegrationMetadataDTO,
  MoneyAmountDTO,
} from "./common";

export type InvoiceDTO = {
  reference: ExternalReferenceDTO;
  partnerCompanyReference: ExternalReferenceDTO;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  total: MoneyAmountDTO;
  paymentStatus: string;
  metadata: IntegrationMetadataDTO;
};

export type FinanceSnapshotDTO = {
  partnerCompanyReference: ExternalReferenceDTO;
  balance: MoneyAmountDTO | null;
  debt: MoneyAmountDTO | null;
  creditLimit: MoneyAmountDTO | null;
  creditDays: number | null;
  sourceUpdatedAt: string | null;
  metadata: IntegrationMetadataDTO;
};

export type ContractBalanceDTO = {
  contractReference: ExternalReferenceDTO;
  contractNumber: string;
  contractName: string;
  currencyReference: ExternalReferenceDTO;
  currencyCode: string;
  signedBalance: number;
  sourceVersion: string | null;
  synchronizedAt: string;
};

export type PaymentCalendarRowDTO = {
  lineNumber: number;
  dueDate: string;
  paymentPercent: number;
  plannedAmount: number;
  vatAmount: number;
};

export type PaymentAllocationDTO = {
  paymentReference: ExternalReferenceDTO;
  paymentType: "bank" | "cash";
  paymentDate: string;
  sourceVersion: string | null;
  posted: boolean;
  deletionMarked: boolean;
  settlementAmount: number;
};

export type PaymentObligationSourceDTO = {
  orderReference: ExternalReferenceDTO;
  orderNumber: string;
  orderDate: string;
  counterpartyReference: ExternalReferenceDTO | null;
  contractReference: ExternalReferenceDTO | null;
  organizationReference: ExternalReferenceDTO | null;
  sourceOrderDataVersion: string | null;
  sourceModifiedAt: string | null;
  orderPosted: boolean;
  orderDeletionMarked: boolean;
  orderStatus: string | null;
  paymentMethod: string;
  bankAccountReference: ExternalReferenceDTO | null;
  bankAccountName: string | null;
  orderCurrencyReference: ExternalReferenceDTO | null;
  orderCurrencyCode: string | null;
  contractCurrencyReference: ExternalReferenceDTO | null;
  contractCurrencyCode: string | null;
  calendarRows: PaymentCalendarRowDTO[];
  paidAmount: number;
  remainingAmount: number | null;
  latestPaymentAt: string | null;
  allocations: PaymentAllocationDTO[];
};
