import type { PartnerProvider } from "../../contracts";
import type {
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
  PartnerCompanyDTO,
  PartnerContractDTO,
  PartnerContractLookupInputDTO,
  PartnerPriceTypeDTO,
  PartnerPriceTypeLookupInputDTO,
  PartnerSearchInputDTO,
  PartnerSearchResultDTO,
} from "../../dto";
import {
  IntegrationHttpError,
  IntegrationMappingError,
  IntegrationODataError,
  IntegrationUnsupportedOperationError,
  IntegrationValidationError,
} from "../../errors";
import type { OneCProviderConfig } from "./one-c-provider.config";
import { DefaultOneCPartnerMapper } from "./one-c-partner.mapper";
import {
  OneCODataClient,
  OneCODataFilterUnsupportedError,
} from "./one-c-odata-client";
import { getOneCSafeDiagnostic } from "./one-c-safe-diagnostic";
import {
  parseRequiredOneCGuid,
} from "./one-c-guid";
import {
  ONE_C_CONTRACT_FIELDS,
  ONE_C_PARTNER_FIELDS,
  ONE_C_PRICE_TYPE_FIELDS,
  ONE_C_RESOURCES,
} from "./one-c-odata-identifiers";
import {
  logPipelineProgress,
  validatePartnerSearchPage,
} from "../../services/partner-search-validation";
import type {
  OneCODataCollectionPayload,
  OneCPartnerCompanyPayload,
  OneCPartnerContractPayload,
  OneCNormalizedPartnerCompanyPayload,
  OneCPartnerPriceTypePayload,
} from "./one-c-provider.types";

const PARTNERS_RESOURCE = ONE_C_RESOURCES.partners;
const CONTRACTS_RESOURCE = ONE_C_RESOURCES.contracts;
const PRICE_TYPES_RESOURCE = ONE_C_RESOURCES.priceTypes;
const PARTNER_FIELDS = ONE_C_PARTNER_FIELDS.join(",");
const CONTRACT_FIELDS = ONE_C_CONTRACT_FIELDS.join(",");
const PRICE_TYPE_FIELDS = ONE_C_PRICE_TYPE_FIELDS.join(",");

export class OneCPartnerODataProvider implements PartnerProvider {
  private readonly mapper = new DefaultOneCPartnerMapper();
  private readonly client: OneCODataClient;

  constructor(private readonly config: OneCProviderConfig) {
    this.client = new OneCODataClient(config);
  }

  async fetchPartnerCompanies(
    _input: IntegrationSyncWindowDTO,
  ): Promise<IntegrationPageResultDTO<PartnerCompanyDTO>> {
    throw new IntegrationUnsupportedOperationError("1C partner import is not implemented.");
  }

  async searchPartners(
    input: PartnerSearchInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerSearchResultDTO>> {
    if (this.config.useMockPartners) {
      const page = {
        items: filterMockPartners(input)
          .map(normalizePartnerRow)
          .filter((item): item is OneCNormalizedPartnerCompanyPayload => item !== null)
          .map((item) => this.mapSearchResult(item)),
        nextCursor: null,
      };
      logPipelineProgress("dto_mapping", "integration_page_result", page.items.length);
      const validated = validatePartnerSearchPage(page, "provider_output");
      logPipelineProgress("provider_return", "integration_page_result", validated.items.length);
      return validated;
    }

    const query = input.query.trim();
    const limit = Math.min(input.limit ?? 10, 50);
    const matches = new Map<string, OneCNormalizedPartnerCompanyPayload>();

    const guidQuery = parseRequiredOneCGuid(query);
    if (guidQuery) {
      const direct = await this.getSingle<OneCPartnerCompanyPayload>(
        `${PARTNERS_RESOURCE}(guid'${guidQuery}')`,
      );
      const partner = direct ? normalizePartnerRow(direct) : null;
      if (partner) matches.set(partner.Ref_Key, partner);
    } else if (isFiscalCodeQuery(query)) {
      const fiscalMatches = await this.scanPartnersByFiscalCode(query, limit);
      fiscalMatches.forEach((item) => matches.set(item.Ref_Key, item));
    } else {
      if (isLikelyOneCPartnerCode(query)) {
        try {
          await this.collectPartners(matches, {
            $select: PARTNER_FIELDS,
            $filter: `Code eq '${escapeODataString(query)}'`,
            $top: String(limit),
          }, "partner_code_query");
        } catch (error) {
          if (!isCodeQueryFallbackError(error)) throw error;
          logCodeQueryFallback(error);
        }
      }

      if (matches.size < limit) {
        await this.collectPartners(matches, {
          $select: PARTNER_FIELDS,
          $filter: `substringof('${escapeODataString(query)}',Description) eq true`,
          $top: String(limit),
        }, "partner_name_query");
      }
    }

    const page = {
      items: [...matches.values()]
        .sort((left, right) => Number(right["Покупатель"]) - Number(left["Покупатель"]))
        .slice(0, limit)
        .map((item) => this.mapSearchResult(item)),
      nextCursor: null,
    };
    logPipelineProgress("dto_mapping", "integration_page_result", page.items.length);
    const validated = validatePartnerSearchPage(page, "provider_output");
    logPipelineProgress("provider_return", "integration_page_result", validated.items.length);
    return validated;
  }

  async fetchPartnerContracts(
    input: PartnerContractLookupInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>> {
    const reference = requireUuid(input.partnerReference, "Partner reference");
    if (this.config.useMockPartners) {
      return {
        items: mockContracts
          .filter((row) => contractBelongsToPartner(row, reference))
          .map((row, index) => this.mapContract(row, index)),
        nextCursor: null,
      };
    }
    const rows = await this.scanContractsByOwner(reference);
    const items = await Promise.all(rows.map(async (row, index) => {
      const contract = this.mapContract(row, index);
      if (!contract.priceTypeReference) return contract;
      logPipelineProgress("price_type_lookup", "partner_contract", 1);
      const priceType = await this.fetchPriceType({ reference: contract.priceTypeReference.externalId });
      return { ...contract, priceTypeName: priceType?.name ?? null };
    }));
    logPipelineProgress("contract_mapping", "partner_contracts", items.length);
    return { items, nextCursor: null };
  }

  async fetchPriceType(input: PartnerPriceTypeLookupInputDTO): Promise<PartnerPriceTypeDTO | null> {
    const reference = requireUuid(input.reference, "Price type reference");
    if (this.config.useMockPartners) {
      const row = mockPriceTypes.find((item) => item.Ref_Key === reference);
      return row ? this.mapper.toPriceTypeDTO(row) : null;
    }
    const row = await this.getSingle<OneCPartnerPriceTypePayload>(
      `${PRICE_TYPES_RESOURCE}(guid'${reference}')`,
    );
    if (row && !isPriceTypeRow(row)) throw new IntegrationValidationError("Invalid 1C price type response.");
    return row && isActivePriceType(row) ? this.mapper.toPriceTypeDTO(row) : null;
  }

  async listPriceTypes(): Promise<IntegrationPageResultDTO<PartnerPriceTypeDTO>> {
    if (this.config.useMockPartners) {
      return { items: mockPriceTypes.map((row, index) => this.mapper.toPriceTypeDTO(row, index)), nextCursor: null };
    }
    const rows = await this.getBoundedCollection<OneCPartnerPriceTypePayload>(PRICE_TYPES_RESOURCE, {
      $select: PRICE_TYPE_FIELDS,
    });
    assertRows(rows, isPriceTypeRow);
    return { items: rows.filter(isActivePriceType).map((row, index) => this.mapper.toPriceTypeDTO(row, index)), nextCursor: null };
  }

  private async collectPartners(
    target: Map<string, OneCNormalizedPartnerCompanyPayload>,
    params: Record<string, string>,
    requestKind: "partner_code_query" | "partner_name_query",
  ): Promise<void> {
    const rows = await this.getCollection<OneCPartnerCompanyPayload>(PARTNERS_RESOURCE, params, requestKind);
    normalizePartnerRows(rows).forEach((row) => target.set(row.Ref_Key, row));
  }

  private async scanPartnersByFiscalCode(query: string, limit: number): Promise<OneCNormalizedPartnerCompanyPayload[]> {
    const matches: OneCNormalizedPartnerCompanyPayload[] = [];
    const normalizedQuery = query.trim();
    for (let page = 0; page < this.config.partnerSearchMaxPages && matches.length < limit; page += 1) {
      const rows = await this.getCollection<OneCPartnerCompanyPayload>(PARTNERS_RESOURCE, {
        $select: PARTNER_FIELDS,
        $top: String(this.config.partnerSearchPageSize),
        $skip: String(page * this.config.partnerSearchPageSize),
      }, "partner_fiscal_code_scan");
      normalizePartnerRows(rows)
        .filter((row) => row["ИНН"].trim() === normalizedQuery)
        .forEach((row) => matches.push(row));
      if (rows.length < this.config.partnerSearchPageSize) break;
    }
    return matches.slice(0, limit);
  }

  private async scanContractsByOwner(reference: string): Promise<OneCPartnerContractPayload[]> {
    const matches: OneCPartnerContractPayload[] = [];
    for (let page = 0; page < this.config.partnerSearchMaxPages; page += 1) {
      const rows = await this.getCollection<OneCPartnerContractPayload>(CONTRACTS_RESOURCE, {
        $select: CONTRACT_FIELDS,
        $top: String(this.config.partnerSearchPageSize),
        $skip: String(page * this.config.partnerSearchPageSize),
      }, "partner_contract_scan");
      assertRows(rows, isContractRow);
      rows
        .filter((row) => contractBelongsToPartner(row, reference))
        .forEach((row) => matches.push(row));
      if (rows.length < this.config.partnerSearchPageSize) break;
    }
    return matches;
  }

  private async getCollection<T>(
    resource: string,
    params: Record<string, string>,
    requestKind = "collection",
  ): Promise<T[]> {
    const payload = await this.client.get(resource, params, { requestKind });
    logPipelineProgress("odata_response", collectionShape(payload), collectionSize(payload));
    if (!isCollectionPayload<T>(payload)) {
      logPartnerPipelineFailure("odata_envelope", collectionShape(payload), collectionSize(payload));
      throw new IntegrationValidationError("Invalid 1C OData collection response.");
    }
    logPipelineProgress("odata_envelope", "odata_collection", payload.value.length);
    logPipelineProgress("raw_rows", "odata_rows", payload.value.length);
    return payload.value;
  }

  private async getBoundedCollection<T>(resource: string, params: Record<string, string>): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < this.config.partnerSearchMaxPages; page += 1) {
      const pageRows = await this.getCollection<T>(resource, {
        ...params,
        $top: String(this.config.partnerSearchPageSize),
        $skip: String(page * this.config.partnerSearchPageSize),
      }, "bounded_collection");
      rows.push(...pageRows);
      if (pageRows.length < this.config.partnerSearchPageSize) break;
    }
    return rows;
  }

  private async getSingle<T>(resource: string): Promise<T | null> {
    const requestKind = resource.startsWith(PRICE_TYPES_RESOURCE)
      ? "price_type_lookup"
      : "direct_lookup";
    const payload = await this.client.get(resource, {
      $select: resource.startsWith(PARTNERS_RESOURCE) ? PARTNER_FIELDS : PRICE_TYPE_FIELDS,
    }, { requestKind });
    if (isCollectionPayload<T>(payload)) return payload.value[0] ?? null;
    if (isRecord(payload)) return payload as T;
    throw new IntegrationValidationError("Invalid 1C OData record response.");
  }

  private mapSearchResult(
    row: OneCNormalizedPartnerCompanyPayload,
  ): PartnerSearchResultDTO {
    try {
      return this.mapper.toSearchResultDTO(row);
    } catch {
      logPartnerPipelineFailure("dto_mapping", "normalized_partner_row", 1);
      throw new IntegrationMappingError("1C partner mapping failed.");
    }
  }

  private mapContract(
    row: OneCPartnerContractPayload,
    index: number,
  ): PartnerContractDTO {
    try {
      return this.mapper.toContractDTO(row, index);
    } catch {
      throw new IntegrationMappingError("1C contract mapping failed.");
    }
  }
}

export function isLikelyOneCPartnerCode(query: string): boolean {
  return /^[A-Z]{2}-\d{6}$/.test(query.trim());
}

function isFiscalCodeQuery(query: string): boolean {
  return /^\d{6,}$/.test(query.trim());
}

function isCodeQueryFallbackError(error: unknown): boolean {
  return error instanceof OneCODataFilterUnsupportedError ||
    error instanceof IntegrationODataError ||
    error instanceof IntegrationHttpError;
}

function logCodeQueryFallback(error: unknown): void {
  const diagnostic = getOneCSafeDiagnostic(error);
  console.warn({
    event: "one_c_partner_code_query_fallback",
    failedStage: diagnostic?.failedStage ?? "partner_code_query",
    statusCode: diagnostic?.statusCode ?? null,
    resourceName: diagnostic?.resourceName ?? PARTNERS_RESOURCE,
    queryParameterNames: diagnostic?.queryParameterNames ?? [],
  });
}

function logPartnerPipelineFailure(
  stage: "odata_envelope" | "dto_mapping",
  resultShape: string,
  resultCount: number | null,
): void {
  console.error({
    event: "one_c_partner_pipeline_validation_failed",
    stage,
    errorCategory: "invalid_response",
    resultShape,
    resultCount,
    issuePaths: [],
    expectedTypes: [],
    receivedTypes: [],
  });
}

function collectionShape(value: unknown): string {
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

function collectionSize(value: unknown): number | null {
  return isCollectionPayload<unknown>(value) ? value.value.length : null;
}

function isCollectionPayload<T>(value: unknown): value is OneCODataCollectionPayload<T> {
  return isRecord(value) && Array.isArray(value.value);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function escapeODataString(value: string): string { return value.replaceAll("'", "''"); }
function requireUuid(value: string, label: string): string {
  const guid = parseRequiredOneCGuid(value);
  if (!guid) throw new IntegrationValidationError(`${label} must be a 1C GUID.`);
  return guid;
}
function isActiveContract(row: OneCPartnerContractPayload): boolean { return row.DeletionMark !== true && row["Недействителен"] !== true; }
function isActivePriceType(row: OneCPartnerPriceTypePayload): boolean { return row.DeletionMark !== true && row["ЦеныАктуальны"] !== false; }
function isContractRow(value: unknown): value is OneCPartnerContractPayload { return isRecord(value) && parseRequiredOneCGuid(value.Ref_Key) !== null && typeof value.Code === "string" && typeof value.Description === "string" && parseRequiredOneCGuid(value.Owner) !== null && typeof value.Owner_Type === "string"; }
function contractBelongsToPartner(row: OneCPartnerContractPayload, reference: string): boolean {
  const owner = parseRequiredOneCGuid(row.Owner);
  return owner !== null &&
    owner.toLowerCase() === reference.toLowerCase() &&
    row.Owner_Type === "StandardODATA.Catalog_Контрагенты" &&
    isActiveContract(row);
}
function isPriceTypeRow(value: unknown): value is OneCPartnerPriceTypePayload { return isRecord(value) && parseRequiredOneCGuid(value.Ref_Key) !== null && typeof value.Code === "string" && typeof value.Description === "string"; }
function assertRows<T>(rows: unknown[], guard: (value: unknown) => value is T): asserts rows is T[] {
  if (!rows.every(guard)) throw new IntegrationValidationError("Invalid 1C OData row response.");
}

type PartnerRowSkipReason =
  | "folder"
  | "deleted"
  | "inactive"
  | "invalid_reference"
  | "invalid_shape";

function normalizePartnerRows(
  rows: OneCPartnerCompanyPayload[],
): OneCNormalizedPartnerCompanyPayload[] {
  return rows
    .map(normalizePartnerRow)
    .filter((row): row is OneCNormalizedPartnerCompanyPayload => row !== null);
}

function normalizePartnerRow(
  row: OneCPartnerCompanyPayload,
): OneCNormalizedPartnerCompanyPayload | null {
  if (!isRecord(row)) {
    logSkippedPartnerRow("invalid_shape");
    return null;
  }

  const reference = normalizeString(row.Ref_Key);
  if (!parseRequiredOneCGuid(reference)) {
    logSkippedPartnerRow("invalid_reference");
    return null;
  }

  const normalized: OneCNormalizedPartnerCompanyPayload = {
    Ref_Key: parseRequiredOneCGuid(reference)!,
    Code: normalizeString(row.Code),
    Description: normalizeString(row.Description),
    НаименованиеПолное: normalizeString(row["НаименованиеПолное"]),
    ИНН: normalizeString(row["ИНН"]),
    Покупатель: row["Покупатель"] === true,
    Поставщик: row["Поставщик"] === true,
    Недействителен: row["Недействителен"] === true,
    DeletionMark: row.DeletionMark === true,
    IsFolder: row.IsFolder === true,
  };

  if (normalized.IsFolder) {
    logSkippedPartnerRow("folder");
    return null;
  }
  if (normalized.DeletionMark) {
    logSkippedPartnerRow("deleted");
    return null;
  }
  if (normalized["Недействителен"]) {
    logSkippedPartnerRow("inactive");
    return null;
  }
  if (!normalized.Description) {
    logSkippedPartnerRow("invalid_shape");
    return null;
  }

  return normalized;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logSkippedPartnerRow(reason: PartnerRowSkipReason): void {
  console.warn({
    event: "one_c_odata_row_skipped",
    resource: PARTNERS_RESOURCE,
    reason,
  });
}

const mockPartners: OneCPartnerCompanyPayload[] = [{
  Ref_Key: "11111111-1111-4111-8111-111111111111", Code: "MOCK-001",
  Description: "Novotech Demo Partner", НаименованиеПолное: "Novotech Demo Partner SRL",
  ИНН: "1018600013048", Покупатель: true, Поставщик: false,
  Недействителен: false, DeletionMark: false,
}];
const MOCK_PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const MOCK_CONTRACT_ID = "22222222-2222-4222-8222-222222222222";
const MOCK_PRICE_TYPE_ID = "33333333-3333-4333-8333-333333333333";
const mockContracts: OneCPartnerContractPayload[] = [{
  Ref_Key: MOCK_CONTRACT_ID, Code: "MC-1", Description: "Default distribution contract",
  Owner: MOCK_PARTNER_ID, Owner_Type: "StandardODATA.Catalog_Контрагенты",
  ВидЦенКонтрагента_Key: MOCK_PRICE_TYPE_ID,
  Недействителен: false, DeletionMark: false,
}];
const mockPriceTypes: OneCPartnerPriceTypePayload[] = [{
  Ref_Key: MOCK_PRICE_TYPE_ID, Code: "MP-1", Description: "Partner wholesale",
  ЦеныАктуальны: true, DeletionMark: false,
}];
function filterMockPartners(input: PartnerSearchInputDTO): OneCPartnerCompanyPayload[] {
  const query = input.query.trim().toLowerCase();
  return mockPartners.filter((row) => [row.Ref_Key, row.Code, row.Description, row["ИНН"]].some((value) => value?.toLowerCase().includes(query))).slice(0, input.limit ?? 10);
}
