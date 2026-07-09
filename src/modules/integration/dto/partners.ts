import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type PartnerCompanyDTO = {
  reference: ExternalReferenceDTO;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  status: string;
  managerReference: ExternalReferenceDTO | null;
  metadata: IntegrationMetadataDTO;
};
