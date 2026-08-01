import "server-only";

import { z } from "zod";

import { parseOptionalOneCGuid, parseRequiredOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

export const ONE_C_PRODUCT_RELATION_RESOURCES = {
  analog: {
    resource: "InformationRegister_АналогиНоменклатуры",
    select: "Номенклатура_Key,Аналог_Key,Приоритет",
  },
  related: {
    resource: "InformationRegister_СопутствующиеТовары",
    select: "Номенклатура_Key,СопутствующийТовар_Key,Характеристика_Key,ХарактеристикаCопутствующегоТовара_Key,Приоритет",
  },
} as const;

export type ProductRelationType = keyof typeof ONE_C_PRODUCT_RELATION_RESOURCES;

export type ProductRelationSourceRow = {
  relationType: ProductRelationType;
  sourceProductRef: string;
  targetProductRef: string;
  sourceCharacteristicRef: string | null;
  targetCharacteristicRef: string | null;
  priority: number;
  sourceOrdinal: number;
};

export type ProductRelationRejection = {
  relationType: ProductRelationType;
  page: number;
  rowIndex: number;
  reason: "invalid_shape" | "invalid_source" | "invalid_target" | "invalid_characteristic" | "self_relation" | "duplicate_row";
  sourceProductRef?: string;
  targetProductRef?: string;
};

export type ProductRelationSnapshot = {
  rows: ProductRelationSourceRow[];
  rejections: ProductRelationRejection[];
  analogRowsReceived: number;
  relatedRowsReceived: number;
  pagesProcessed: number;
  duplicatesCollapsed: number;
};

const envelopeSchema = z.object({ value: z.array(z.unknown()) });

export class OneCProductRelationProvider {
  constructor(
    private readonly client: OneCODataClient,
    private readonly pageSize = 500,
    private readonly maxPages = 100,
  ) {}

  async loadSnapshot(): Promise<ProductRelationSnapshot> {
    const analog = await this.loadType("analog");
    const related = await this.loadType("related");
    const unique = new Map<string, ProductRelationSourceRow>();
    const duplicateRejections: ProductRelationRejection[] = [];
    let duplicatesCollapsed = 0;
    for (const row of [...analog.rows, ...related.rows]) {
      const key = `${row.relationType}:${row.sourceProductRef}:${row.targetProductRef}`;
      const current = unique.get(key);
      if (!current) unique.set(key, row);
      else {
        duplicatesCollapsed += 1;
        duplicateRejections.push({
          relationType: row.relationType,
          page: Math.floor(row.sourceOrdinal / this.pageSize),
          rowIndex: row.sourceOrdinal % this.pageSize,
          reason: "duplicate_row",
          sourceProductRef: row.sourceProductRef,
          targetProductRef: row.targetProductRef,
        });
        if (compareSourceRows(row, current) < 0) unique.set(key, row);
      }
    }
    return {
      rows: [...unique.values()],
      rejections: [...analog.rejections, ...related.rejections, ...duplicateRejections],
      analogRowsReceived: analog.received,
      relatedRowsReceived: related.received,
      pagesProcessed: analog.pages + related.pages,
      duplicatesCollapsed,
    };
  }

  private async loadType(relationType: ProductRelationType) {
    const definition = ONE_C_PRODUCT_RELATION_RESOURCES[relationType];
    const rows: ProductRelationSourceRow[] = [];
    const rejections: ProductRelationRejection[] = [];
    let received = 0;
    let pages = 0;
    for (let page = 0; page < this.maxPages; page += 1) {
      const payload = envelopeSchema.parse(await this.client.get(definition.resource, {
        "$select": definition.select,
        "$top": String(this.pageSize),
        "$skip": String(page * this.pageSize),
      }, { requestKind: `product_relation_${relationType}` }));
      pages += 1;
      received += payload.value.length;
      payload.value.forEach((value, rowIndex) => {
        const parsed = parseRelationRow(relationType, value, page, rowIndex, received - payload.value.length + rowIndex);
        if ("reason" in parsed) rejections.push(parsed);
        else rows.push(parsed);
      });
      if (payload.value.length < this.pageSize) break;
      if (page === this.maxPages - 1) throw new Error("1C product relation pagination limit reached.");
    }
    return { rows, rejections, received, pages };
  }
}

export function parseRelationRow(
  relationType: ProductRelationType,
  value: unknown,
  page = 0,
  rowIndex = 0,
  sourceOrdinal = rowIndex,
): ProductRelationSourceRow | ProductRelationRejection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { relationType, page, rowIndex, reason: "invalid_shape" };
  }
  const row = value as Record<string, unknown>;
  const sourceProductRef = parseRequiredOneCGuid(row["Номенклатура_Key"]);
  if (!sourceProductRef) return { relationType, page, rowIndex, reason: "invalid_source" };
  const targetProductRef = parseRequiredOneCGuid(
    row[relationType === "analog" ? "Аналог_Key" : "СопутствующийТовар_Key"],
  );
  if (!targetProductRef) return { relationType, page, rowIndex, reason: "invalid_target" };
  if (sourceProductRef === targetProductRef) {
    return { relationType, page, rowIndex, reason: "self_relation", sourceProductRef, targetProductRef };
  }
  const sourceCharacteristicValue = row["Характеристика_Key"];
  const targetCharacteristicValue = row["ХарактеристикаCопутствующегоТовара_Key"];
  if (relationType === "related"
    && (!isOptionalCharacteristic(sourceCharacteristicValue)
      || !isOptionalCharacteristic(targetCharacteristicValue))) {
    return {
      relationType,
      page,
      rowIndex,
      reason: "invalid_characteristic",
      sourceProductRef,
      targetProductRef,
    };
  }
  const rawPriority = Number(row["Приоритет"]);
  return {
    relationType,
    sourceProductRef,
    targetProductRef,
    sourceCharacteristicRef: relationType === "related"
      ? parseOptionalOneCGuid(row["Характеристика_Key"])
      : null,
    targetCharacteristicRef: relationType === "related"
      ? parseOptionalOneCGuid(row["ХарактеристикаCопутствующегоТовара_Key"])
      : null,
    priority: Number.isFinite(rawPriority) && rawPriority >= 0 ? Math.trunc(rawPriority) : 0,
    sourceOrdinal,
  };
}

function isOptionalCharacteristic(value: unknown): boolean {
  return value == null || parseOptionalOneCGuid(value) !== null
    || value === "00000000-0000-0000-0000-000000000000";
}

function compareSourceRows(left: ProductRelationSourceRow, right: ProductRelationSourceRow): number {
  return left.priority - right.priority
    || left.sourceOrdinal - right.sourceOrdinal
    || left.targetProductRef.localeCompare(right.targetProductRef);
}
