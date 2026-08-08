import "server-only";

import { XMLParser } from "fast-xml-parser";

import type { OneCEnv } from "@/src/lib/env";

import {
  IntegrationProviderUnavailableError,
  IntegrationValidationError,
} from "../../errors";

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_CANDIDATES = 100;
const SERVICE_TERMS = [
  "ПриемИПередачаВРемонт",
  "ПриемВРемонт",
  "ПриёмВРемонт",
  "ПередачаВРемонт",
  "Ремонт",
  "Сервис",
  "ВыполнениеРемонта",
  "СерииНоменклатуры",
  "ИсторияПродаж",
] as const;

type XmlNode = Record<string, unknown>;

export type OneCServiceMetadataCandidate = {
  entityType: string;
  entitySet: string | null;
  matchedTerms: string[];
  keys: string[];
  properties: { name: string; type: string | null; nullable: boolean | null }[];
  navigationProperties: { name: string; type: string | null }[];
};

export type OneCServiceMetadataAudit = {
  metadataStatus: number;
  metadataBytes: number;
  entityTypeCount: number;
  candidateCount: number;
  candidatesTruncated: boolean;
  candidates: OneCServiceMetadataCandidate[];
};

export type OneCServiceSourceAudit = {
  sourceEntity: "Document_ПриемИПередачаВРемонт";
  statusEntity: "Catalog_ЭтапыРемонта";
  documentStatus: number;
  statusCatalogStatus: number;
  rowsReceived: number;
  sourceKeys: string[];
  sourceValueTypes: Record<string, string>;
  statusCatalog: { code: string | null; description: string; active: boolean }[];
  representativeRows: {
    number: string;
    date: string;
    posted: boolean;
    deleted: boolean;
    statusDescription: string | null;
    productReferencePresent: boolean;
    serialReferencePresent: boolean;
    counterpartyReferencePresent: boolean;
    contractReferencePresent: boolean;
    serviceCenterReferencePresent: boolean;
    sourceSalePresent: boolean;
    warrantyTermPresent: boolean;
    reportedFaultLength: number;
    repairResultLength: number;
    dataVersionPresent: boolean;
  }[];
};

const SERVICE_HEADER_SELECT = [
  "Ref_Key",
  "DataVersion",
  "Number",
  "Date",
  "DeletionMark",
  "Posted",
  "Контрагент_Key",
  "Организация_Key",
  "Договор_Key",
  "Номенклатура_Key",
  "Характеристика_Key",
  "Серия_Key",
  "СостояниеРемонта_Key",
  "СервисЦентр_Key",
  "СтруктурнаяЕдиница_Key",
  "Ответственный_Key",
  "ОписаниеНеисправности",
  "ОписаниеМеханическихПовреждений",
  "ОписаниеРемонта",
  "РезультатРемонта",
  "ДокументПродажи",
  "СрокДействияГарантии",
  "Гарантийный",
  "ДатаОкончанияРемонта",
  "ДатаПередачаВСервисныйЦентр",
  "ДатаРемонтВыполнен",
  "ДатаВыдачаИзРемонта",
  "ВыдачаИзРемонта",
  "ПередачаВСервисныйЦентр",
  "РемонтВыполнен",
] as const;

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

export async function auditOneCServiceMetadata(
  config: Pick<OneCEnv, "baseUrl" | "username" | "password" | "requestTimeoutMs">,
): Promise<OneCServiceMetadataAudit> {
  const { baseUrl, username, password } = config;
  if (!baseUrl || !username || !password) {
    throw new IntegrationProviderUnavailableError("1C OData is not configured.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/$metadata`, {
    headers: {
      Accept: "application/xml",
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
    },
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  if (!response.ok) {
    throw new IntegrationProviderUnavailableError("1C metadata is unavailable.");
  }

  const metadata = await response.text();
  const metadataBytes = Buffer.byteLength(metadata, "utf8");
  if (metadataBytes === 0 || metadataBytes > MAX_METADATA_BYTES) {
    throw new IntegrationValidationError("1C metadata response size is invalid.");
  }

  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    trimValues: true,
  }).parse(metadata) as unknown;
  const entityTypes = collectNamedNodes(parsed, "EntityType");
  const entitySetByType = new Map<string, string>();
  for (const entitySet of collectNamedNodes(parsed, "EntitySet")) {
    const name = asString(entitySet.Name);
    const entityType = asString(entitySet.EntityType)?.split(".").at(-1) ?? null;
    if (name && entityType) entitySetByType.set(entityType, name);
  }

  const candidates = entityTypes.flatMap((entityType) => {
    const candidate = mapCandidate(entityType, entitySetByType);
    return candidate ? [candidate] : [];
  });

  return {
    metadataStatus: response.status,
    metadataBytes,
    entityTypeCount: entityTypes.length,
    candidateCount: candidates.length,
    candidatesTruncated: candidates.length > MAX_CANDIDATES,
    candidates: candidates.slice(0, MAX_CANDIDATES),
  };
}

export async function auditOneCServiceSource(
  config: Pick<OneCEnv, "baseUrl" | "username" | "password" | "requestTimeoutMs">,
): Promise<OneCServiceSourceAudit> {
  const { baseUrl, username, password } = config;
  if (!baseUrl || !username || !password) {
    throw new IntegrationProviderUnavailableError("1C OData is not configured.");
  }
  const root = baseUrl.replace(/\/$/, "");
  const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  const [documentResponse, statusResponse] = await Promise.all([
    fetch(`${root}/Document_ПриемИПередачаВРемонт?$select=${SERVICE_HEADER_SELECT.join(",")}&$top=100&$format=json`, {
      headers: { Accept: "application/json", Authorization: authorization },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    }),
    fetch(`${root}/Catalog_ЭтапыРемонта?$select=Ref_Key,Code,Description,DeletionMark&$top=100&$format=json`, {
      headers: { Accept: "application/json", Authorization: authorization },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    }),
  ]);
  if (!documentResponse.ok || !statusResponse.ok) {
    throw new IntegrationProviderUnavailableError("1C service source audit is unavailable.");
  }
  const documentEnvelope = parseEnvelope(await documentResponse.json());
  const statusEnvelope = parseEnvelope(await statusResponse.json());
  const statuses = new Map(statusEnvelope.map((row) => [text(row.Ref_Key), text(row.Description)]));
  const sortedRows = [...documentEnvelope].sort((left, right) =>
    Date.parse(text(right.Date)) - Date.parse(text(left.Date)),
  );

  return {
    sourceEntity: "Document_ПриемИПередачаВРемонт",
    statusEntity: "Catalog_ЭтапыРемонта",
    documentStatus: documentResponse.status,
    statusCatalogStatus: statusResponse.status,
    rowsReceived: documentEnvelope.length,
    sourceKeys: [...new Set(documentEnvelope.flatMap((row) => Object.keys(row)))].sort(),
    sourceValueTypes: summarizeValueTypes(documentEnvelope),
    statusCatalog: statusEnvelope.flatMap((row) => {
      const description = text(row.Description);
      return description
        ? [{ code: nullableText(row.Code), description, active: row.DeletionMark !== true }]
        : [];
    }),
    representativeRows: sortedRows.slice(0, 20).map((row) => ({
      number: text(row.Number),
      date: text(row.Date),
      posted: row.Posted === true,
      deleted: row.DeletionMark === true,
      statusDescription: statuses.get(text(row.СостояниеРемонта_Key)) || null,
      productReferencePresent: hasReference(row.Номенклатура_Key),
      serialReferencePresent: hasReference(row.Серия_Key),
      counterpartyReferencePresent: hasReference(row.Контрагент_Key),
      contractReferencePresent: hasReference(row.Договор_Key),
      serviceCenterReferencePresent: hasReference(row.СервисЦентр_Key),
      sourceSalePresent: hasReference(row.ДокументПродажи),
      warrantyTermPresent: row.СрокДействияГарантии !== null && row.СрокДействияГарантии !== undefined,
      reportedFaultLength: text(row.ОписаниеНеисправности).length,
      repairResultLength: text(row.ОписаниеРемонта || row.РезультатРемонта).length,
      dataVersionPresent: text(row.DataVersion).length > 0,
    })),
  };
}

function parseEnvelope(value: unknown): XmlNode[] {
  if (!isRecord(value) || !Array.isArray(value.value) || !value.value.every(isRecord)) {
    throw new IntegrationValidationError("1C service source envelope is invalid.");
  }
  return value.value;
}

function summarizeValueTypes(rows: XmlNode[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) continue;
      result[key] ??= Array.isArray(value) ? "array" : typeof value;
    }
  }
  return result;
}

function hasReference(value: unknown): boolean {
  const normalized = text(value).toLowerCase();
  return normalized.length > 0 && normalized !== ZERO_GUID;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  return text(value) || null;
}

function mapCandidate(
  entityType: XmlNode,
  entitySetByType: ReadonlyMap<string, string>,
): OneCServiceMetadataCandidate | null {
  const entityTypeName = asString(entityType.Name);
  if (!entityTypeName) return null;

  const properties = asArray(entityType.Property).flatMap((property) => {
    if (!isRecord(property)) return [];
    const name = asString(property.Name);
    return name
      ? [{ name, type: asString(property.Type), nullable: parseNullable(property.Nullable) }]
      : [];
  });
  const navigationProperties = asArray(entityType.NavigationProperty).flatMap((property) => {
    if (!isRecord(property)) return [];
    const name = asString(property.Name);
    return name ? [{ name, type: asString(property.Type) }] : [];
  });
  const searchableNames = [
    entityTypeName,
    entitySetByType.get(entityTypeName) ?? "",
    ...properties.map(({ name }) => name),
    ...navigationProperties.map(({ name }) => name),
  ];
  const matchedTerms = SERVICE_TERMS.filter((term) =>
    searchableNames.some((name) => name.toLocaleLowerCase("ru").includes(term.toLocaleLowerCase("ru"))),
  );
  if (matchedTerms.length === 0) return null;

  return {
    entityType: entityTypeName,
    entitySet: entitySetByType.get(entityTypeName) ?? null,
    matchedTerms,
    keys: asArray(entityType.Key).flatMap((key) => {
      if (!isRecord(key)) return [];
      return asArray(key.PropertyRef).flatMap((propertyRef) =>
        isRecord(propertyRef) && asString(propertyRef.Name)
          ? [asString(propertyRef.Name)!]
          : [],
      );
    }),
    properties,
    navigationProperties,
  };
}

function collectNamedNodes(value: unknown, localName: string): XmlNode[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectNamedNodes(item, localName));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key.split(":").at(-1) === localName ? asArray(child).filter(isRecord) : []),
    ...collectNamedNodes(child, localName),
  ]);
}

function parseNullable(value: unknown): boolean | null {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
}

function asArray(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
