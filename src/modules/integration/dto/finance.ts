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
