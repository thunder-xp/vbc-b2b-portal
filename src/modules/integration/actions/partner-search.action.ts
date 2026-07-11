"use server";

import {
  failureFromError,
  invalidInput,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import {
  createUserProfileService,
  getAuthenticatedUserId,
} from "../../access-control/actions/service-factory";
import { ForbiddenError } from "../../access-control/services";
import { canApprovePartnerRequests } from "../../access-control/services/internal-authorization";
import type { PartnerContractDTO, PartnerPriceTypeDTO, PartnerSearchResultDTO } from "../dto";
import {
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationValidationError,
} from "../errors";
import { createPartnerLookupService } from "../services";
import { getOneCEnv } from "../../../lib/env";

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

export type PartnerContractActionDto = {
  external1cContractId: string;
  code: string;
  name: string;
  number: string | null;
  date: string | null;
  contractType: string | null;
  priceTypeSource: "counterparty" | "contract" | null;
  priceType: PartnerPriceTypeActionDto | null;
};

export type PartnerPriceTypeActionDto = {
  external1cPriceTypeId: string;
  name: string;
  currency: string | null;
};

export async function searchOneCPartnersAction(input: {
  query?: string | null;
}): Promise<ActionResult<PartnerSearchResultActionDto[]>> {
  const query = input.query?.trim() ?? "";

  if (query.length < 2) {
    return invalidInput("Enter at least 2 characters to search 1C partners.");
  }

  try {
    await ensurePartnerApprovalAccess();

    const result = await createPartnerLookupService(getOneCEnv()).searchPartners({
      query,
      limit: 10,
    });

    return success(
      "1C partner search completed.",
      result.items.map(toActionDto),
    );
  } catch (error) {
    return integrationFailure(error);
  }
}

export async function getOneCPartnerContractsAction(input: { partnerReference?: string | null }): Promise<ActionResult<PartnerContractActionDto[]>> {
  const partnerReference = input.partnerReference?.trim() ?? "";
  if (!partnerReference) return invalidInput("Select a 1C counterparty first.");
  try {
    await ensurePartnerApprovalAccess();
    const service = createPartnerLookupService(getOneCEnv());
    const result = await service.getPartnerContracts(partnerReference);
    const items = result.items.map(toContractActionDto);
    return success("1C contracts loaded.", items);
  } catch (error) {
    return integrationFailure(error);
  }
}

export async function listOneCPriceTypesAction(): Promise<ActionResult<PartnerPriceTypeActionDto[]>> {
  try {
    await ensurePartnerApprovalAccess();
    const result = await createPartnerLookupService(getOneCEnv()).listPriceTypes();
    return success("1C price types loaded.", result.items.map(toPriceTypeActionDto));
  } catch (error) {
    return integrationFailure(error);
  }
}

function toActionDto(
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

async function ensurePartnerApprovalAccess(): Promise<void> {
  const userId = await getAuthenticatedUserId();
  const profile = await createUserProfileService().ensureActiveUser(userId);
  if (!canApprovePartnerRequests(profile)) throw new ForbiddenError();
}

function toContractActionDto(contract: PartnerContractDTO): PartnerContractActionDto {
  return {
    external1cContractId: contract.reference.externalId,
    code: contract.code,
    name: contract.name,
    number: contract.number,
    date: contract.date,
    contractType: contract.contractType,
    priceTypeSource: contract.priceTypeSource,
    priceType: contract.priceTypeReference
      ? {
          external1cPriceTypeId: contract.priceTypeReference.externalId,
          name: contract.priceTypeName ?? contract.priceTypeReference.externalId,
          currency: null,
        }
      : null,
  };
}

function toPriceTypeActionDto(priceType: PartnerPriceTypeDTO): PartnerPriceTypeActionDto {
  return { external1cPriceTypeId: priceType.reference.externalId, name: priceType.name, currency: priceType.currency };
}

function integrationFailure<T>(error: unknown): ActionResult<T> {
  if (error instanceof IntegrationTimeoutError) {
    return { success: false, errorCode: "ONEC_TIMEOUT", message: "Search request timed out.", data: null };
  }
  if (error instanceof IntegrationProviderUnavailableError) {
    return { success: false, errorCode: "ONEC_UNAVAILABLE", message: "1C is temporarily unavailable.", data: null };
  }
  if (error instanceof IntegrationValidationError) {
    return { success: false, errorCode: "ONEC_INVALID_RESPONSE", message: "Invalid server response from 1C.", data: null };
  }
  return failureFromError(error);
}
