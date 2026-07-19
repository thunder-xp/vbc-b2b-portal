import type {
  CatalogPlanOperation,
  CatalogQueryPlanRepository,
} from "./catalog-query-plan.repository";

export type CatalogQueryPlanSummary = {
  operation: CatalogPlanOperation;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  rows: number | null;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
  temporaryBlocks: number;
  sortMethods: string[];
  indexNames: string[];
  hasSequentialScan: boolean;
};

type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] };

export class CatalogQueryPlanService {
  constructor(private readonly repository: CatalogQueryPlanRepository) {}

  async explain(operation: CatalogPlanOperation, companyId: string): Promise<CatalogQueryPlanSummary> {
    const rawPlan = await this.repository.explain(operation, companyId);
    return summarizePlan(operation, rawPlan);
  }
}

export function summarizePlan(
  operation: CatalogPlanOperation,
  rawPlan: unknown,
): CatalogQueryPlanSummary {
  const envelope = Array.isArray(rawPlan) ? rawPlan[0] : null;
  const root = isRecord(envelope) && isRecord(envelope.Plan) ? envelope.Plan as PlanNode : null;
  if (!root) throw new Error("Catalog query plan response is invalid.");

  const nodes = collectNodes(root);
  return {
    operation,
    planningTimeMs: numeric(envelope["Planning Time"]),
    executionTimeMs: numeric(envelope["Execution Time"]),
    rows: numeric(root["Actual Rows"]),
    sharedHitBlocks: numeric(root["Shared Hit Blocks"]) ?? 0,
    sharedReadBlocks: numeric(root["Shared Read Blocks"]) ?? 0,
    temporaryBlocks: (numeric(root["Temp Read Blocks"]) ?? 0) + (numeric(root["Temp Written Blocks"]) ?? 0),
    sortMethods: uniqueStrings(nodes.map((node) => node["Sort Method"])),
    indexNames: uniqueStrings(nodes.map((node) => node["Index Name"])),
    hasSequentialScan: nodes.some((node) => node["Node Type"] === "Seq Scan"),
  };
}

function collectNodes(root: PlanNode): PlanNode[] {
  return [root, ...(root.Plans ?? []).flatMap(collectNodes)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}
