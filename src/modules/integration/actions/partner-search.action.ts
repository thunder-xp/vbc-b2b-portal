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
import type { PartnerSearchResultDTO } from "../dto";
import { createPartnerLookupService } from "../services";
import { getOneCEnv } from "../../../lib/env";

export type PartnerSearchResultActionDto = {
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  external1cId: string;
  contract: {
    external1cContractId: string;
    name: string;
  } | null;
  priceType: {
    external1cPriceTypeId: string;
    name: string;
    currency: string | null;
  } | null;
};

export async function searchOneCPartnersAction(input: {
  query?: string | null;
}): Promise<ActionResult<PartnerSearchResultActionDto[]>> {
  const query = input.query?.trim() ?? "";

  if (query.length < 2) {
    return invalidInput("Enter at least 2 characters to search 1C partners.");
  }

  try {
    const userId = await getAuthenticatedUserId();
    const profile = await createUserProfileService().ensureActiveUser(userId);

    if (!canApprovePartnerRequests(profile)) {
      throw new ForbiddenError();
    }

    const result = await createPartnerLookupService(getOneCEnv()).searchPartners({
      query,
      limit: 10,
    });

    return success(
      "1C partner search completed.",
      result.items.map(toActionDto),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

function toActionDto(
  partner: PartnerSearchResultDTO,
): PartnerSearchResultActionDto {
  const contract =
    partner.contracts.find((item) => item.active && item.isDefault) ??
    partner.contracts.find((item) => item.active) ??
    null;
  const priceType =
    partner.priceTypes.find((item) => item.active && item.isDefault) ??
    partner.priceTypes.find((item) => item.active) ??
    null;

  return {
    displayName: partner.displayName,
    legalName: partner.legalName,
    taxId: partner.taxId,
    external1cId: partner.reference.externalId,
    contract: contract
      ? {
          external1cContractId: contract.reference.externalId,
          name: contract.name,
        }
      : null,
    priceType: priceType
      ? {
          external1cPriceTypeId: priceType.reference.externalId,
          name: priceType.name,
          currency: priceType.currency,
        }
      : null,
  };
}
