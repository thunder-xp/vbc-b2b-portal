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
import { IntegrationUnsupportedOperationError, IntegrationValidationError } from "../../errors";
import type { OneCProviderConfig } from "./one-c-provider.config";
import { DefaultOneCPartnerMapper } from "./one-c-partner.mapper";
import {
  OneCODataClient,
  OneCODataFilterUnsupportedError,
} from "./one-c-odata-client";
import type {
  OneCODataCollectionPayload,
  OneCPartnerCompanyPayload,
  OneCPartnerContractPayload,
  OneCNormalizedPartnerCompanyPayload,
  OneCPartnerPriceTypePayload,
} from "./one-c-provider.types";

const PARTNERS_RESOURCE = "Catalog_Контрагенты";
const CONTRACTS_RESOURCE = "Catalog_ДоговорыКонтрагентов";
const PRICE_TYPES_RESOURCE = "Catalog_ВидыЦен";
const PARTNER_FIELDS = [
  "Ref_Key", "Code", "Description", "НаименованиеПолное", "ИНН",
  "Покупатель", "Поставщик", "Недействителен", "DeletionMark", "IsFolder",
].join(",");
const CONTRACT_FIELDS = [
  "Ref_Key", "Code", "Description", "Owner_Key", "НомерДоговора",
  "ДатаДоговора", "ВидДоговора", "ВидЦен_Key",
  "ВидЦенКонтрагента_Key", "Организация_Key", "Недействителен", "DeletionMark",
].join(",");
const PRICE_TYPE_FIELDS = [
  "Ref_Key", "Code", "Description", "ВалютаЦены_Key", "ЦенаВключаетНДС",
  "ТипВидаЦен", "ЦеныАктуальны", "DeletionMark",
].join(",");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      return {
        items: filterMockPartners(input)
          .map(normalizePartnerRow)
          .filter((item): item is OneCNormalizedPartnerCompanyPayload => item !== null)
          .map((item) => this.mapper.toSearchResultDTO(item)),
        nextCursor: null,
      };
    }

    const query = input.query.trim();
    const limit = Math.min(input.limit ?? 10, 50);
    const matches = new Map<string, OneCNormalizedPartnerCompanyPayload>();

    if (UUID_PATTERN.test(query)) {
      const direct = await this.getSingle<OneCPartnerCompanyPayload>(
        `${PARTNERS_RESOURCE}(guid'${query}')`,
      );
      const partner = direct ? normalizePartnerRow(direct) : null;
      if (partner) matches.set(partner.Ref_Key, partner);
    } else {
      await this.collectPartners(matches, {
        $select: PARTNER_FIELDS,
        $filter: `Code eq '${escapeODataString(query)}'`,
        $top: String(limit),
      });
      if (matches.size < limit) {
        await this.collectPartners(matches, {
          $select: PARTNER_FIELDS,
          $filter: `substringof('${escapeODataString(query)}',Description) eq true`,
          $top: String(limit),
        });
      }
      if (/^\d{6,}$/.test(query) && matches.size < limit) {
        const fiscalMatches = await this.scanPartnersByFiscalCode(query, limit - matches.size);
        fiscalMatches.forEach((item) => matches.set(item.Ref_Key, item));
      }
    }

    return {
      items: [...matches.values()]
        .sort((left, right) => Number(right.Покупатель) - Number(left.Покупатель))
        .slice(0, limit)
        .map((item) => this.mapper.toSearchResultDTO(item)),
      nextCursor: null,
    };
  }

  async fetchPartnerContracts(
    input: PartnerContractLookupInputDTO,
  ): Promise<IntegrationPageResultDTO<PartnerContractDTO>> {
    const reference = requireUuid(input.partnerReference, "Partner reference");
    if (this.config.useMockPartners) {
      return { items: mockContracts.filter((row) => row.Owner_Key === reference).map((row, index) => this.mapper.toContractDTO(row, index)), nextCursor: null };
    }
    let rows: OneCPartnerContractPayload[];
    try {
      rows = await this.getBoundedCollection<OneCPartnerContractPayload>(CONTRACTS_RESOURCE, {
        $select: CONTRACT_FIELDS,
        $filter: `Owner_Key eq guid'${reference}'`,
      });
    } catch (error) {
      if (!(error instanceof OneCODataFilterUnsupportedError)) throw error;
      rows = await this.scanContractsByOwner(reference);
    }
    assertRows(rows, isContractRow);

    const active = rows.filter((row) => row.Owner_Key.toLowerCase() === reference.toLowerCase() && isActiveContract(row));
    const items = await Promise.all(active.map(async (row, index) => {
      const contract = this.mapper.toContractDTO(row, index);
      if (!contract.priceTypeReference) return contract;
      const priceType = await this.fetchPriceType({ reference: contract.priceTypeReference.externalId });
      return { ...contract, priceTypeName: priceType?.name ?? null };
    }));
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

  private async collectPartners(target: Map<string, OneCNormalizedPartnerCompanyPayload>, params: Record<string, string>): Promise<void> {
    const rows = await this.getCollection<OneCPartnerCompanyPayload>(PARTNERS_RESOURCE, params);
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
      });
      normalizePartnerRows(rows)
        .filter((row) => row.ИНН.trim() === normalizedQuery)
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
      });
      assertRows(rows, isContractRow);
      rows.filter((row) => row.Owner_Key.toLowerCase() === reference.toLowerCase()).forEach((row) => matches.push(row));
      if (rows.length < this.config.partnerSearchPageSize) break;
    }
    return matches;
  }

  private async getCollection<T>(resource: string, params: Record<string, string>): Promise<T[]> {
    const payload = await this.client.get(resource, params);
    if (!isCollectionPayload<T>(payload)) throw new IntegrationValidationError("Invalid 1C OData collection response.");
    return payload.value;
  }

  private async getBoundedCollection<T>(resource: string, params: Record<string, string>): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < this.config.partnerSearchMaxPages; page += 1) {
      const pageRows = await this.getCollection<T>(resource, {
        ...params,
        $top: String(this.config.partnerSearchPageSize),
        $skip: String(page * this.config.partnerSearchPageSize),
      });
      rows.push(...pageRows);
      if (pageRows.length < this.config.partnerSearchPageSize) break;
    }
    return rows;
  }

  private async getSingle<T>(resource: string): Promise<T | null> {
    const payload = await this.client.get(resource, { $select: resource.startsWith(PARTNERS_RESOURCE) ? PARTNER_FIELDS : PRICE_TYPE_FIELDS });
    if (isCollectionPayload<T>(payload)) return payload.value[0] ?? null;
    if (isRecord(payload)) return payload as T;
    throw new IntegrationValidationError("Invalid 1C OData record response.");
  }
}

function isCollectionPayload<T>(value: unknown): value is OneCODataCollectionPayload<T> {
  return isRecord(value) && Array.isArray(value.value);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function escapeODataString(value: string): string { return value.replaceAll("'", "''"); }
function requireUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new IntegrationValidationError(`${label} must be a GUID.`);
  return value;
}
function isActiveContract(row: OneCPartnerContractPayload): boolean { return row.DeletionMark !== true && row.Недействителен !== true; }
function isActivePriceType(row: OneCPartnerPriceTypePayload): boolean { return row.DeletionMark !== true && row.ЦеныАктуальны !== false; }
function isContractRow(value: unknown): value is OneCPartnerContractPayload { return isRecord(value) && typeof value.Ref_Key === "string" && typeof value.Code === "string" && typeof value.Description === "string" && typeof value.Owner_Key === "string"; }
function isPriceTypeRow(value: unknown): value is OneCPartnerPriceTypePayload { return isRecord(value) && typeof value.Ref_Key === "string" && typeof value.Code === "string" && typeof value.Description === "string"; }
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
  if (!reference || !UUID_PATTERN.test(reference)) {
    logSkippedPartnerRow("invalid_reference");
    return null;
  }

  const normalized: OneCNormalizedPartnerCompanyPayload = {
    Ref_Key: reference,
    Code: normalizeString(row.Code),
    Description: normalizeString(row.Description),
    НаименованиеПолное: normalizeString(row.НаименованиеПолное),
    ИНН: normalizeString(row.ИНН),
    Покупатель: row.Покупатель === true,
    Поставщик: row.Поставщик === true,
    Недействителен: row.Недействителен === true,
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
  if (normalized.Недействителен) {
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
  Owner_Key: MOCK_PARTNER_ID, ВидЦенКонтрагента_Key: MOCK_PRICE_TYPE_ID,
  Недействителен: false, DeletionMark: false,
}];
const mockPriceTypes: OneCPartnerPriceTypePayload[] = [{
  Ref_Key: MOCK_PRICE_TYPE_ID, Code: "MP-1", Description: "Partner wholesale",
  ЦеныАктуальны: true, DeletionMark: false,
}];
function filterMockPartners(input: PartnerSearchInputDTO): OneCPartnerCompanyPayload[] {
  const query = input.query.trim().toLowerCase();
  return mockPartners.filter((row) => [row.Ref_Key, row.Code, row.Description, row.ИНН].some((value) => value?.toLowerCase().includes(query))).slice(0, input.limit ?? 10);
}
