import type { PartnerSearchResultDTO } from "../dto";

export type PartnerSearchResultActionDto = {
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  external1cId: string;
  code: string;
  fullName: string | null;
  buyer: boolean;
  supplier: boolean;
};

export function mapPartnerSearchResultToActionDto(
  partner: PartnerSearchResultDTO,
): PartnerSearchResultActionDto {
  return {
    displayName: partner.displayName,
    legalName: partner.legalName,
    taxId: partner.taxId,
    external1cId: partner.reference.externalId,
    code: partner.code,
    fullName: partner.fullName,
    buyer: partner.buyer,
    supplier: partner.supplier,
  };
}
