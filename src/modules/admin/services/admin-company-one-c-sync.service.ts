import "server-only";

import { NOVOTECH_ONE_C_ORGANIZATION_REF } from "@/src/modules/integration/config";
import type { PartnerProvider } from "@/src/modules/integration/contracts";
import type {
  PartnerContractDTO,
  PartnerPriceTypeDTO,
  PartnerSearchResultDTO,
} from "@/src/modules/integration/dto";

import type { AdminCompanyRepository } from "../repositories";
import type {
  AdminOneCManualSyncApplyResult,
  AdminOneCManualSyncCandidate,
  AdminOneCManualSyncDiscovery,
  AdminOneCManualSyncErrorCode,
} from "../types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AdminOneCManualSyncError extends Error {
  constructor(readonly code: AdminOneCManualSyncErrorCode) {
    super(code);
    this.name = "AdminOneCManualSyncError";
  }
}

type DiscoveryContext = {
  discovery: AdminOneCManualSyncDiscovery;
  snapshot: Record<string, unknown>;
};

export class AdminCompanyOneCManualSyncService {
  constructor(
    private readonly repository: AdminCompanyRepository,
    private readonly provider: PartnerProvider,
  ) {}

  async discover(input: {
    companyId: string;
    query?: string;
    correlationId: string;
  }): Promise<AdminOneCManualSyncDiscovery> {
    return (await this.discoverWithSnapshot(input)).discovery;
  }

  async apply(input: {
    companyId: string;
    mainContractRef: string;
    cashContractRef: string;
    reason: string;
    correlationId: string;
  }): Promise<AdminOneCManualSyncApplyResult> {
    const reason = input.reason.trim();
    if (!UUID_PATTERN.test(input.companyId)
      || !UUID_PATTERN.test(input.mainContractRef)
      || !UUID_PATTERN.test(input.cashContractRef)
      || !UUID_PATTERN.test(input.correlationId)
      || reason.length < 10 || reason.length > 500) {
      throw new Error("Invalid manual 1C synchronization request.");
    }

    const context = await this.discoverWithSnapshot({
      companyId: input.companyId,
      correlationId: input.correlationId,
    });
    const main = context.discovery.candidates.find((candidate) =>
      candidate.contractRef === input.mainContractRef && candidate.nsCandidate && candidate.eligible,
    );
    const cash = context.discovery.candidates.find((candidate) =>
      candidate.contractRef === input.cashContractRef
      && candidate.cashDisplayCandidate
      && candidate.eligible,
    );
    if (!main || !cash) throw new AdminOneCManualSyncError("CONTRACT_NOT_FOUND");

    const published = await this.repository.publishManualOneCSnapshot({
      companyId: input.companyId,
      snapshot: context.snapshot,
      previousValues: context.discovery.previous,
      proposedValues: {
        mainContractRef: main.contractRef,
        cashContractRef: cash.contractRef,
        priceTypeRef: main.priceTypeRef,
      },
      reason,
      correlationId: input.correlationId,
    });
    if (published.code !== "MANUAL_ONE_C_SNAPSHOT_PUBLISHED") {
      throw new AdminOneCManualSyncError("COUNTERPARTY_CONFLICT");
    }

    const mainResult = await this.repository.mapContract({
      companyId: input.companyId,
      contractRef: main.contractRef,
      expectedVersion: context.discovery.contractMappingVersion,
      reason,
      correlationId: input.correlationId,
    });
    if (mainResult.code !== "CONTRACT_MAPPING_SUCCESS") {
      return failure(input.correlationId, mainResult.code);
    }
    const cashResult = await this.repository.mapCashContract({
      companyId: input.companyId,
      contractRef: cash.contractRef,
      expectedVersion: context.discovery.cashMappingVersion,
      reason,
      correlationId: crypto.randomUUID(),
    });
    if (cashResult.code !== "CASH_CONTRACT_MAPPING_SUCCESS") {
      return failure(input.correlationId, cashResult.code);
    }
    const profileResult = await this.synchronizeProfile({
      companyId: input.companyId,
      expectedVersion: context.discovery.commercialProfileVersion,
      reason,
    });
    if (profileResult !== "COMMERCIAL_PROFILE_SYNC_SUCCESS") {
      return failure(input.correlationId, profileResult);
    }

    const final = await this.repository.getContractMapping(input.companyId);
    if (!final?.readiness.ready) {
      return failure(input.correlationId, "COMMERCIAL_PROFILE_NOT_READY", final?.readiness.class ?? null);
    }
    return {
      status: "success",
      code: "MANUAL_ONE_C_SYNC_SUCCESS",
      message: "Данные 1С подтверждены, сопоставления сохранены, коммерческая готовность пересчитана.",
      correlationId: input.correlationId,
      readiness: final.readiness.class,
      mainContractRef: final.currentContractRef,
      cashContractRef: final.cashMapping.contractRef,
      priceTypeRef: final.currentPriceTypeRef,
    };
  }

  private async synchronizeProfile(input: {
    companyId: string;
    expectedVersion: number;
    reason: string;
  }): Promise<string> {
    const result = await this.repository.beginCommercialProfileSync({
      companyId: input.companyId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      correlationId: crypto.randomUUID(),
    });
    if (!result.claimed || !result.runId || !result.counterpartyRef || !result.contractRef) {
      return result.code;
    }
    try {
      const source = await this.provider.fetchCommercialProfile({
        partnerReference: result.counterpartyRef,
        contractReference: result.contractRef,
      });
      return (await this.repository.publishCommercialProfileSync(result.runId, source)).code;
    } catch (error) {
      await this.repository.failCommercialProfileSync(
        result.runId,
        error instanceof Error ? error.name : "provider_failure",
      );
      throw error;
    }
  }

  private async discoverWithSnapshot(input: {
    companyId: string;
    query?: string;
    correlationId: string;
  }): Promise<DiscoveryContext> {
    if (!UUID_PATTERN.test(input.companyId) || !UUID_PATTERN.test(input.correlationId)) {
      throw new Error("Invalid manual 1C synchronization discovery request.");
    }
    const [overview, mapping] = await Promise.all([
      this.repository.getOverview(input.companyId),
      this.repository.getContractMapping(input.companyId),
    ]);
    if (!overview || !mapping) throw new AdminOneCManualSyncError("COUNTERPARTY_CONFLICT");

    const partner = await this.resolvePartner(overview.external1cId, input.query);
    if (!partner || !partner.active) throw new AdminOneCManualSyncError("CONTRACT_NOT_FOUND");
    const identityMatches = Boolean(
      overview.external1cId
      && partner.reference.externalId.toLowerCase() === overview.external1cId.toLowerCase()
      && (!overview.external1cCode || partner.code === overview.external1cCode)
      && (!overview.fiscalCode || partner.taxId === overview.fiscalCode),
    );
    if (!identityMatches) throw new AdminOneCManualSyncError("COUNTERPARTY_CONFLICT");

    const contractReferences = [...new Set([
      ...mapping.candidates.map((candidate) => candidate.external1cId),
      mapping.currentContractRef,
      mapping.cashMapping.contractRef,
      mapping.suggestedContractRef,
      mapping.suggestedCashContractRef,
    ].filter((reference): reference is string => Boolean(reference)))];
    const contractsPage = await this.provider.fetchPartnerContracts({
      partnerReference: partner.reference.externalId,
      contractReferences,
    });
    const defaultContract = await this.provider.resolveCustomerOrderContract({
      partnerReference: partner.reference.externalId,
      organizationReference: NOVOTECH_ONE_C_ORGANIZATION_REF,
      effectiveAt: new Date().toISOString(),
    });
    const priceTypeRefs = [...new Set(contractsPage.items.flatMap((contract) =>
      contract.priceTypeReference ? [contract.priceTypeReference.externalId] : [],
    ))];
    const priceTypes = new Map((await Promise.all(priceTypeRefs.map(async (reference) =>
      [reference, await this.provider.fetchPriceType({ reference })] as const,
    ))).filter((entry): entry is readonly [string, PartnerPriceTypeDTO] => entry[1] !== null));
    const candidates = contractsPage.items.map((contract) => toCandidate(
      contract,
      priceTypes.get(contract.priceTypeReference?.externalId ?? "") ?? null,
      defaultContract?.reference.externalId ?? null,
      partner.reference.externalId,
    ));
    const eligibleNs = candidates.filter((candidate) => candidate.nsCandidate && candidate.eligible);
    const eligibleCash = candidates.filter((candidate) => candidate.cashDisplayCandidate && candidate.eligible);
    const errors = collectErrors(candidates, eligibleNs, eligibleCash);
    const proposedMain = eligibleNs.length === 1 ? eligibleNs[0]! : null;
    const proposedCash = eligibleCash.length === 1 ? eligibleCash[0]! : null;
    const discovery: AdminOneCManualSyncDiscovery = {
      companyId: input.companyId,
      correlationId: input.correlationId,
      counterparty: {
        reference: partner.reference.externalId,
        code: partner.code,
        name: partner.displayName,
        fiscalCode: partner.taxId,
        verified: true,
      },
      previous: {
        mainContractRef: mapping.currentContractRef,
        cashContractRef: mapping.cashMapping.contractRef,
        priceTypeRef: mapping.currentPriceTypeRef,
        readiness: mapping.readiness.class,
      },
      proposed: {
        mainContractRef: proposedMain?.contractRef ?? null,
        cashContractRef: proposedCash?.contractRef ?? null,
        priceTypeRef: proposedMain?.priceTypeRef ?? null,
      },
      candidates,
      errors,
      canApply: eligibleNs.length > 0 && eligibleCash.length > 0,
      contractMappingVersion: mapping.version,
      cashMappingVersion: mapping.cashMapping.version,
      commercialProfileVersion: mapping.commercialProfileVersion,
      verifiedAt: new Date().toISOString(),
    };
    return {
      discovery,
      snapshot: {
        counterparty: {
          reference: partner.reference.externalId,
          code: partner.code,
          name: partner.displayName,
          fiscalCode: partner.taxId,
          active: partner.active,
        },
        contracts: contractsPage.items.map((contract) => ({
          reference: contract.reference.externalId,
          ownerReference: contract.ownerReference.externalId,
          code: contract.code,
          name: contract.name,
          number: contract.number,
          date: contract.date,
          contractType: contract.contractType,
          organizationReference: contract.organizationReference?.externalId ?? null,
          settlementCurrencyReference: contract.settlementCurrencyReference?.externalId ?? null,
          signed: contract.signed,
          default: contract.reference.externalId === defaultContract?.reference.externalId,
          priceTypeReference: contract.priceTypeReference?.externalId ?? null,
          active: contract.active,
          deleted: contract.deleted,
        })),
        priceTypes: [...priceTypes.values()].map((priceType) => ({
          reference: priceType.reference.externalId,
          code: null,
          name: priceType.name,
          currencyReference: priceType.currency,
          active: priceType.active,
        })),
      },
    };
  }

  private async resolvePartner(
    boundReference: string | null,
    query?: string,
  ): Promise<PartnerSearchResultDTO | null> {
    if (boundReference) return this.provider.fetchPartnerByReference({ reference: boundReference });
    const normalized = query?.trim() ?? "";
    if (!normalized) throw new AdminOneCManualSyncError("COUNTERPARTY_CONFLICT");
    if (UUID_PATTERN.test(normalized)) {
      return this.provider.fetchPartnerByReference({ reference: normalized });
    }
    const results = await this.provider.searchPartners({ query: normalized, limit: 5 });
    if (results.items.length !== 1) throw new AdminOneCManualSyncError("COUNTERPARTY_CONFLICT");
    return results.items[0]!;
  }
}

function toCandidate(
  contract: PartnerContractDTO,
  priceType: PartnerPriceTypeDTO | null,
  defaultContractRef: string | null,
  counterpartyRef: string,
): AdminOneCManualSyncCandidate {
  const dateValid = !contract.date || (Number.isFinite(Date.parse(contract.date)) && Date.parse(contract.date) <= Date.now());
  let blockingCode: AdminOneCManualSyncErrorCode | null = null;
  if (contract.ownerReference.externalId.toLowerCase() !== counterpartyRef.toLowerCase()) {
    blockingCode = "COUNTERPARTY_CONFLICT";
  } else if (!contract.active || contract.deleted || !dateValid) {
    blockingCode = "CONTRACT_NOT_FOUND";
  } else if (!isCustomerContract(contract.contractType)) {
    blockingCode = "CONTRACT_NOT_FOUND";
  } else if (contract.organizationReference?.externalId.toLowerCase() !== NOVOTECH_ONE_C_ORGANIZATION_REF) {
    blockingCode = "ORGANIZATION_MISMATCH";
  } else if (!contract.priceTypeReference || !priceType?.active) {
    blockingCode = "PRICE_TYPE_NOT_DEFINED";
  } else if (!contract.settlementCurrencyReference || !priceType.currency) {
    blockingCode = "CURRENCY_CONFLICT";
  }
  return {
    contractRef: contract.reference.externalId,
    code: contract.code,
    name: contract.name,
    number: contract.number,
    date: contract.date,
    contractType: contract.contractType,
    organizationRef: contract.organizationReference?.externalId ?? null,
    settlementCurrencyRef: contract.settlementCurrencyReference?.externalId ?? null,
    signed: contract.signed,
    active: contract.active,
    deleted: contract.deleted,
    default: contract.reference.externalId === defaultContractRef,
    priceTypeRef: contract.priceTypeReference?.externalId ?? null,
    priceTypeName: priceType?.name ?? contract.priceTypeName,
    priceCurrencyRef: priceType?.currency ?? null,
    priceTypeActive: priceType?.active ?? false,
    eligible: blockingCode === null,
    blockingCode,
    nsCandidate: (contract.number ?? "").trim().toLocaleUpperCase("ru-RU").startsWith("NS"),
    cashDisplayCandidate: normalizeLabel(contract.name) === "спокупателем",
  };
}

function collectErrors(
  candidates: AdminOneCManualSyncCandidate[],
  ns: AdminOneCManualSyncCandidate[],
  cash: AdminOneCManualSyncCandidate[],
): AdminOneCManualSyncErrorCode[] {
  const errors = new Set<AdminOneCManualSyncErrorCode>();
  candidates.forEach((candidate) => { if (candidate.blockingCode) errors.add(candidate.blockingCode); });
  if (ns.length === 0 || cash.length === 0) errors.add("CONTRACT_NOT_FOUND");
  if (ns.length > 1) errors.add("MULTIPLE_CONTRACT_CANDIDATES");
  return [...errors];
}

function isCustomerContract(value: string | null): boolean {
  return normalizeLabel(value ?? "") === "спокупателем";
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll(/[^а-яa-z]/g, "");
}

function failure(
  correlationId: string,
  code: string,
  readiness: string | null = null,
): AdminOneCManualSyncApplyResult {
  return {
    status: "error",
    code,
    message: "Синхронизация остановлена: проверенные данные не прошли существующие коммерческие правила.",
    correlationId,
    readiness,
    mainContractRef: null,
    cashContractRef: null,
    priceTypeRef: null,
  };
}
