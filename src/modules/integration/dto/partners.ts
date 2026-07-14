import type { ExternalReferenceDTO, IntegrationMetadataDTO } from "./common";

export type PartnerContractDTO = {
  reference: ExternalReferenceDTO;
  code: string;
  name: string;
  number: string | null;
  date: string | null;
  contractType: string | null;
  organizationReference: ExternalReferenceDTO | null;
  isDefault: boolean;
  active: boolean;
  priceTypeReference: ExternalReferenceDTO | null;
  priceTypeName: string | null;
  priceTypeSource: "counterparty" | "contract" | null;
};

export type PartnerPriceTypeDTO = {
  reference: ExternalReferenceDTO;
  name: string;
  currency: string | null;
  includesVat: boolean | null;
  type: string | null;
  isDefault: boolean;
  active: boolean;
};

export type PartnerContractLookupInputDTO = {
  partnerReference: string;
};

export type PartnerCustomerContractResolutionInputDTO = {
  partnerReference: string;
  organizationReference: string;
  effectiveAt: string;
};

export type PartnerPriceTypeLookupInputDTO = {
  reference: string;
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
  code: string;
  fullName: string | null;
  active: boolean;
  buyer: boolean;
  supplier: boolean;
  contracts: PartnerContractDTO[];
  priceTypes: PartnerPriceTypeDTO[];
};
