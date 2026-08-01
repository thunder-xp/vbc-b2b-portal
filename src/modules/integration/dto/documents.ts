import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type DocumentDTO = {
  reference: ExternalReferenceDTO;
  ownerReference: ExternalReferenceDTO | null;
  sourceEntity: string;
  title: string;
  documentType: string;
  documentNumber: string;
  documentDate: string;
  posted: boolean;
  deletionMarked: boolean;
  contractReference: ExternalReferenceDTO | null;
  orderReference: ExternalReferenceDTO | null;
  baseDocumentReference: ExternalReferenceDTO | null;
  correctionReference: ExternalReferenceDTO | null;
  currencyReference: ExternalReferenceDTO | null;
  retrievalCapability: "metadata_only";
  fileName: string | null;
  url: string | null;
  version: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};
