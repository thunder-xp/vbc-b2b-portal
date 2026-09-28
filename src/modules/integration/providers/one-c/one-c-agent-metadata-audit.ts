import "server-only";

import { XMLParser } from "fast-xml-parser";

import type { OneCEnv } from "@/src/lib/env";

import { IntegrationProviderUnavailableError, IntegrationValidationError } from "../../errors";

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const MAX_CANDIDATES = 180;
const AGENT_TERMS = [
  "\u0410\u0433\u0435\u043d\u0442",
  "\u041f\u0440\u043e\u0435\u043a\u0442",
  "\u0414\u043e\u0433\u043e\u0432\u043e\u0440",
  "\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442",
  "\u041f\u0440\u0438\u0432\u043b\u0435\u0447",
  "\u0412\u043e\u0437\u043d\u0430\u0433\u0440\u0430\u0436",
  "\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d",
] as const;

type XmlNode = Record<string, unknown>;

export type OneCAgentMetadataCandidate = {
  entityType: string;
  entitySet: string | null;
  matchedTerms: string[];
  keys: string[];
  properties: { name: string; type: string | null; nullable: boolean | null }[];
};

export type OneCAgentMetadataAudit = {
  metadataStatus: number;
  metadataBytes: number;
  entityTypeCount: number;
  candidateCount: number;
  candidatesTruncated: boolean;
  candidates: OneCAgentMetadataCandidate[];
};

export async function auditOneCAgentMetadata(
  config: Pick<OneCEnv, "baseUrl" | "username" | "password" | "requestTimeoutMs">,
): Promise<OneCAgentMetadataAudit> {
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
  if (!response.ok) throw new IntegrationProviderUnavailableError("1C metadata is unavailable.");

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
    const entityTypeName = asString(entityType.Name);
    if (!entityTypeName) return [];
    const properties = asArray(entityType.Property).flatMap((property) => {
      if (!isRecord(property)) return [];
      const name = asString(property.Name);
      return name ? [{ name, type: asString(property.Type), nullable: parseNullable(property.Nullable) }] : [];
    });
    const searchableNames = [entityTypeName, entitySetByType.get(entityTypeName) ?? "", ...properties.map(({ name }) => name)];
    const matchedTerms = AGENT_TERMS.filter((term) =>
      searchableNames.some((name) => name.toLocaleLowerCase("ru").includes(term.toLocaleLowerCase("ru"))),
    );
    if (matchedTerms.length === 0) return [];
    return [{
      entityType: entityTypeName,
      entitySet: entitySetByType.get(entityTypeName) ?? null,
      matchedTerms: [...matchedTerms],
      keys: asArray(entityType.Key).flatMap((key) => {
        if (!isRecord(key)) return [];
        return asArray(key.PropertyRef).flatMap((propertyRef) =>
          isRecord(propertyRef) && asString(propertyRef.Name) ? [asString(propertyRef.Name)!] : [],
        );
      }),
      properties,
    }];
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
