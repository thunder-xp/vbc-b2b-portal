import "server-only";

import { XMLParser } from "fast-xml-parser";

import type { OneCEnv } from "@/src/lib/env";

import { IntegrationProviderUnavailableError, IntegrationValidationError } from "../../errors";

const RELATION_TERM = /(Аналог|Сопутств|Связ|Комплект|Аксессуар)/iu;
const PRODUCT_TERM = /(Номенклатур|Товар)/iu;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_CANDIDATES = 100;

type XmlNode = Record<string, unknown>;

export type OneCMetadataProperty = {
  name: string;
  type: string | null;
  nullable: boolean | null;
};

export type OneCRelationMetadataCandidate = {
  entityType: string;
  entitySet: string | null;
  keys: string[];
  properties: OneCMetadataProperty[];
  navigationProperties: { name: string; type: string | null }[];
  matchedBy: "relation_term" | "multiple_product_references";
};

export type OneCRelationMetadataAudit = {
  metadataStatus: number;
  metadataBytes: number;
  entityTypeCount: number;
  candidateCount: number;
  candidatesTruncated: boolean;
  candidates: OneCRelationMetadataCandidate[];
};

export async function auditOneCRelationMetadata(
  config: OneCEnv,
): Promise<OneCRelationMetadataAudit> {
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
  const entitySets = collectNamedNodes(parsed, "EntitySet");
  const entitySetByType = new Map<string, string>();
  for (const entitySet of entitySets) {
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
): OneCRelationMetadataCandidate | null {
  const entityTypeName = asString(entityType.Name);
  if (!entityTypeName) return null;

  const properties = asArray(entityType.Property).flatMap((property) => {
    if (!isRecord(property)) return [];
    const name = asString(property.Name);
    if (!name) return [];
    return [{
      name,
      type: asString(property.Type),
      nullable: parseNullable(property.Nullable),
    }];
  });
  const navigationProperties = asArray(entityType.NavigationProperty).flatMap((property) => {
    if (!isRecord(property)) return [];
    const name = asString(property.Name);
    if (!name) return [];
    return [{ name, type: asString(property.Type) }];
  });
  const searchableNames = [
    entityTypeName,
    ...properties.map(({ name }) => name),
    ...navigationProperties.map(({ name }) => name),
  ];
  const productReferenceCount = properties.filter(({ name }) =>
    PRODUCT_TERM.test(name) && /(_Key|Ref|Ссылка|Владелец|Owner)$/iu.test(name)
  ).length;
  const hasRelationTerm = searchableNames.some((name) => RELATION_TERM.test(name));
  if (!hasRelationTerm && productReferenceCount < 2) return null;

  const keys = asArray(entityType.Key).flatMap((key) => {
    if (!isRecord(key)) return [];
    return asArray(key.PropertyRef).flatMap((propertyRef) =>
      isRecord(propertyRef) && asString(propertyRef.Name)
        ? [asString(propertyRef.Name)!]
        : []
    );
  });

  return {
    entityType: entityTypeName,
    entitySet: entitySetByType.get(entityTypeName) ?? null,
    keys,
    properties,
    navigationProperties,
    matchedBy: hasRelationTerm ? "relation_term" : "multiple_product_references",
  };
}

function collectNamedNodes(value: unknown, localName: string): XmlNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNamedNodes(item, localName));
  }
  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const own = key.split(":").at(-1) === localName
      ? asArray(child).filter(isRecord)
      : [];
    return [...own, ...collectNamedNodes(child, localName)];
  });
}

function parseNullable(value: unknown): boolean | null {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is XmlNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
