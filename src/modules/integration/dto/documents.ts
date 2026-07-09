import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type DocumentDTO = {
  reference: ExternalReferenceDTO;
  ownerReference: ExternalReferenceDTO | null;
  title: string;
  documentType: string;
  fileName: string | null;
  url: string | null;
  version: string | null;
  isActive: boolean;
  metadata: IntegrationMetadataDTO;
};
