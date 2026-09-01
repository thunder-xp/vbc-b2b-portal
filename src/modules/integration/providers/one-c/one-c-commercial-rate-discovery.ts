import "server-only";

import { randomUUID } from "node:crypto";

import { XMLParser } from "fast-xml-parser";

import type { OneCEnv } from "@/src/lib/env";

import {
  IntegrationProviderUnavailableError,
  IntegrationValidationError,
} from "../../errors";

const BCRU_REF = "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c";
const MAX_METADATA_ENTITIES = 25;
const MAX_PROPERTIES = 18;
const MAX_PROBES = 36;
const MAX_ROWS = 10;
const RELEVANT =
  /(курс|валют|цен|рознич|bcru|rtl|msrp|обмен|коммерч|rate|currency|price)/iu;
const VALUE_FIELD =
  /(курс|кратност|ставк|процент|нацен|скидк|значен|сумм|rate|value|amount|percent)/iu;
const SAFE_IDENTITY =
  /^(Ref_Key|Code|Description|DeletionMark|DataVersion|Period|Date|Number|Posted|Active)$/u;

export type OneCCommercialRateDiscovery = {
  correlationId: string;
  generatedAt: string;
  metadata: {
    entityCount: number;
    relevantEntities: MetadataEntity[];
    truncated: boolean;
  };
  probes: ProbeResult[];
  requestCount: number;
  durationMs: number;
};

type MetadataEntity = {
  entity: string;
  entityType: string;
  properties: Array<{ name: string; type: string }>;
  referenceFields: string[];
};

type ProbeResult = {
  entity: string;
  kind: "known_ref" | "code_113" | "code_999" | "recent_candidate";
  rowCount: number;
  rows: Array<Record<string, string | number | boolean | null>>;
  status: "ok" | "unsupported" | "failed";
  statusCode: number;
};

export async function discoverOneCCommercialRateSources(
  env: OneCEnv,
): Promise<OneCCommercialRateDiscovery> {
  const startedAt = performance.now();
  const correlationId = randomUUID();
  const connection = connectionConfig(env);
  const metadataResponse = await authorizedFetch(
    `${connection.baseUrl}/$metadata`,
    connection.authorization,
    "application/xml",
  );
  if (!metadataResponse.ok)
    throw new IntegrationProviderUnavailableError(
      `1C metadata request failed with HTTP ${metadataResponse.status}.`,
    );
  const metadataXml = await metadataResponse.text();
  const entities = parseMetadata(metadataXml);
  const relevant = entities
    .filter(isRelevantEntity)
    .slice(0, MAX_METADATA_ENTITIES);
  const plans = buildProbePlans(relevant).slice(0, MAX_PROBES);
  const probes: ProbeResult[] = [];

  for (let index = 0; index < plans.length; index += 4) {
    probes.push(
      ...(await Promise.all(
        plans
          .slice(index, index + 4)
          .map((plan) => executeProbe(plan, connection)),
      )),
    );
  }

  return {
    correlationId,
    generatedAt: new Date().toISOString(),
    metadata: {
      entityCount: entities.length,
      relevantEntities: relevant.map(safeMetadataEntity),
      truncated: relevant.length < entities.filter(isRelevantEntity).length,
    },
    probes,
    requestCount: 1 + plans.length,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

type Connection = { baseUrl: string; authorization: string; timeoutMs: number };
type ProbePlan = {
  entity: MetadataEntity;
  kind: ProbeResult["kind"];
  filter?: string;
  orderby?: string;
};

function connectionConfig(env: OneCEnv): Connection {
  if (!env.baseUrl || !env.username || !env.password)
    throw new IntegrationProviderUnavailableError(
      "1C OData is not configured.",
    );
  return {
    baseUrl: env.baseUrl.replace(/\/$/, ""),
    authorization: `Basic ${Buffer.from(`${env.username}:${env.password}`, "utf8").toString("base64")}`,
    timeoutMs: Math.min(Math.max(env.requestTimeoutMs, 1_000), 15_000),
  };
}

function parseMetadata(xml: string): MetadataEntity[] {
  if (xml.length < 100 || xml.length > 20_000_000)
    throw new IntegrationValidationError("1C metadata size is invalid.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
  }).parse(xml) as unknown;
  const schemas = array(
    record(record(record(parsed).Edmx).DataServices).Schema,
  );
  const result: MetadataEntity[] = [];

  for (const schemaValue of schemas) {
    const schema = record(schemaValue);
    const namespace = text(schema.Namespace);
    const types = new Map(
      array(schema.EntityType).map((value) => {
        const entityType = record(value);
        return [text(entityType.Name), entityType] as const;
      }),
    );
    for (const containerValue of array(schema.EntityContainer)) {
      for (const setValue of array(record(containerValue).EntitySet)) {
        const set = record(setValue);
        const entity = text(set.Name);
        const qualifiedType = text(set.EntityType);
        const typeName = qualifiedType.startsWith(`${namespace}.`)
          ? qualifiedType.slice(namespace.length + 1)
          : (qualifiedType.split(".").at(-1) ?? qualifiedType);
        const type = types.get(typeName);
        if (!entity || !type) continue;
        const properties = array(type.Property)
          .map((propertyValue) => {
            const property = record(propertyValue);
            return { name: text(property.Name), type: text(property.Type) };
          })
          .filter((property) => property.name && property.type);
        result.push({
          entity,
          entityType: qualifiedType,
          properties,
          referenceFields: properties
            .filter((property) => /(?:_Key|Ref_Key)$/u.test(property.name))
            .map((property) => property.name),
        });
      }
    }
  }
  return result;
}

function isRelevantEntity(entity: MetadataEntity): boolean {
  return (
    RELEVANT.test(entity.entity) ||
    entity.properties.some((property) => RELEVANT.test(property.name))
  );
}

function buildProbePlans(entities: MetadataEntity[]): ProbePlan[] {
  const plans: ProbePlan[] = [];
  for (const entity of entities) {
    const names = new Set(entity.properties.map((property) => property.name));
    if (names.has("Ref_Key"))
      plans.push({
        entity,
        kind: "known_ref",
        filter: `Ref_Key eq guid'${BCRU_REF}'`,
      });
    if (names.has("Code")) {
      plans.push({ entity, kind: "code_113", filter: "Code eq '113'" });
      plans.push({ entity, kind: "code_999", filter: "Code eq '999'" });
    }
    if (
      !names.has("Code") &&
      entity.properties.some((property) => VALUE_FIELD.test(property.name))
    ) {
      const orderby = names.has("Period")
        ? "Period desc"
        : names.has("Date")
          ? "Date desc"
          : undefined;
      plans.push({ entity, kind: "recent_candidate", orderby });
    }
  }
  return plans;
}

async function executeProbe(
  plan: ProbePlan,
  connection: Connection,
): Promise<ProbeResult> {
  const select = selectedProperties(plan.entity);
  const url = new URL(`${connection.baseUrl}/${plan.entity.entity}`);
  url.searchParams.set("$select", select.join(","));
  url.searchParams.set(
    "$top",
    String(plan.kind === "known_ref" ? 1 : MAX_ROWS),
  );
  url.searchParams.set("$format", "json");
  if (plan.filter) url.searchParams.set("$filter", plan.filter);
  if (plan.orderby) url.searchParams.set("$orderby", plan.orderby);

  try {
    const response = await authorizedFetch(
      url.toString(),
      connection.authorization,
      "application/json",
      connection.timeoutMs,
    );
    if (!response.ok)
      return {
        entity: plan.entity.entity,
        kind: plan.kind,
        rowCount: 0,
        rows: [],
        status: response.status === 400 ? "unsupported" : "failed",
        statusCode: response.status,
      };
    const payload = (await response.json()) as unknown;
    const rows = array(record(payload).value)
      .slice(0, MAX_ROWS)
      .map((row) => safeRow(record(row), select));
    return {
      entity: plan.entity.entity,
      kind: plan.kind,
      rowCount: rows.length,
      rows,
      status: "ok",
      statusCode: response.status,
    };
  } catch {
    return {
      entity: plan.entity.entity,
      kind: plan.kind,
      rowCount: 0,
      rows: [],
      status: "failed",
      statusCode: 0,
    };
  }
}

function selectedProperties(entity: MetadataEntity): string[] {
  const relevant = entity.properties.filter(
    (property) =>
      SAFE_IDENTITY.test(property.name) ||
      RELEVANT.test(property.name) ||
      VALUE_FIELD.test(property.name),
  );
  const references = entity.properties.filter((property) =>
    /(?:_Key|Ref_Key)$/u.test(property.name),
  );
  const selected = [
    ...new Set([...relevant, ...references].map((property) => property.name)),
  ].slice(0, MAX_PROPERTIES);
  return selected.length > 0
    ? selected
    : entity.properties.slice(0, 1).map(({ name }) => name);
}

function safeMetadataEntity(entity: MetadataEntity): MetadataEntity {
  const selected = new Set(selectedProperties(entity));
  return {
    entity: entity.entity,
    entityType: entity.entityType,
    properties: entity.properties.filter(({ name }) => selected.has(name)),
    referenceFields: entity.referenceFields.filter((name) =>
      selected.has(name),
    ),
  };
}

function safeRow(
  row: Record<string, unknown>,
  selected: string[],
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    selected.flatMap((property) => {
      const value = row[property];
      return value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
        ? [[property, typeof value === "string" ? value.slice(0, 240) : value]]
        : [];
    }),
  );
}

async function authorizedFetch(
  url: string,
  authorization: string,
  accept: string,
  timeoutMs = 15_000,
): Promise<Response> {
  return fetch(url, {
    headers: { Accept: accept, Authorization: authorization },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
