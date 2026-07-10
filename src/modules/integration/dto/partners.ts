import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type PartnerContractDTO = {
  reference: ExternalReferenceDTO;
  name: string;
  isDefault: boolean;
  active: boolean;
};

export type PartnerPriceTypeDTO = {
  reference: ExternalReferenceDTO;
  name: string;
  currency: string | null;
  isDefault: boolean;
  active: boolean;
};

export type PartnerCompanyDTO = {
  reference: ExternalReferenceDTO;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  status: string;
  managerReference: ExternalReferenceDTO | null;
  metadata: IntegrationMetadataDTO;
};

export type PartnerSearchInputDTO = {
  query: string;
  limit?: number;
};

export type PartnerSearchResultDTO = PartnerCompanyDTO & {
  contracts: PartnerContractDTO[];
  priceTypes: PartnerPriceTypeDTO[];
};
