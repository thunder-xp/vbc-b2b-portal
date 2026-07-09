export type IntegrationDirection = "inbound" | "outbound";

export type IntegrationOperationStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "skipped";

export type ExternalReferenceDTO = {
  providerCode: string;
  externalId: string;
  externalType: string;
};

export type IntegrationPageRequestDTO = {
  limit?: number;
  cursor?: string | null;
};

export type IntegrationPageResultDTO<TItem> = {
  items: TItem[];
  nextCursor: string | null;
};

export type IntegrationSyncWindowDTO = {
  changedSince?: string | null;
  page?: IntegrationPageRequestDTO;
};

export type IntegrationMetadataDTO = {
  sourceReference: ExternalReferenceDTO;
  sourceUpdatedAt: string | null;
  importedAt: string | null;
};

export type MoneyAmountDTO = {
  currency: string;
  amount: number;
};

export type IntegrationResultDTO<TData> = {
  status: IntegrationOperationStatus;
  data: TData;
  warnings: string[];
};
