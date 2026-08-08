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
