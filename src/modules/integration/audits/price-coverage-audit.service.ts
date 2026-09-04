import "server-only";

import { createHash } from "node:crypto";

import type { CurrentProductPriceDTO, PricingProvider } from "../contracts";
import type {
  GovernedPriceCoverageCandidate,
  GovernedPriceCoverageSnapshot,
  PriceCoverageAuditRepository,
} from "./price-coverage-audit.repository";

const MAX_CANDIDATES = 100;
const MAX_PRODUCTS_PER_SOURCE_REQUEST = 100;
const SOURCE_REQUEST_CONCURRENCY = 2;

export type PriceCoverageAuditIssue = {
  sku: string;
  productName: string;
  companyNames: string[];
  governedPriceType: string;
  severity: "high" | "medium";
  sourcePriceExists: boolean;
  repairable: boolean;
  reason: "SOURCE_PRICE_ABSENT" | "SOURCE_PRICE_INACTIVE";
  requiredAction: string;
  safeProductFingerprint: string;
};

export type PriceCoverageAuditResult = {
  status: "completed";
  priceCoverageReady: boolean;
  candidateCount: number;
  autoRepaired: number;
  irreparableSourceGaps: number;
  repairableProjectionGaps: number;
  activeCartsBlocked: number;
  providerRequestCount: number;
  candidateSelectionMs: number;
  sourceLookupMs: number;
  repairDurationMs: number;
  totalMs: number;
  before: GovernedPriceCoverageSnapshot["summary"];
  after: GovernedPriceCoverageSnapshot["summary"];
  issues: PriceCoverageAuditIssue[];
};

type GroupResult = {
  repaired: number;
  requestCount: number;
  sourceLookupMs: number;
  repairMs: number;
  issues: PriceCoverageAuditIssue[];
};

export class PriceCoverageAuditService {
  constructor(
    private readonly provider: PricingProvider,
    private readonly repository: PriceCoverageAuditRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async run(limit = MAX_CANDIDATES): Promise<PriceCoverageAuditResult> {
    const startedAt = this.now();
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_CANDIDATES);
    const before = await this.repository.getSnapshot();
    const selectionStartedAt = this.now();
    const candidates = await this.repository.listCandidates(boundedLimit);
    const candidateSelectionMs = this.now() - selectionStartedAt;

    if (!this.provider.fetchCurrentProductPrices) {
      throw new Error("Authoritative targeted price lookup is unavailable.");
    }

    const groups = groupCandidates(candidates);
    const results = await mapConcurrent(groups, SOURCE_REQUEST_CONCURRENCY, (group) => this.processGroup(group));
    const after = await this.repository.getSnapshot();
    const remaining = await this.repository.listCandidates(boundedLimit);
    const repaired = results.reduce((sum, result) => sum + result.repaired, 0);

    return {
      status: "completed",
      priceCoverageReady: remaining.length === 0,
      candidateCount: candidates.length,
      autoRepaired: repaired,
      irreparableSourceGaps: results.reduce((sum, result) => sum + result.issues.length, 0),
      repairableProjectionGaps: Math.max(0, candidates.length - repaired - results.reduce((sum, result) => sum + result.issues.length, 0)),
      activeCartsBlocked: after.summary.activeCartsBlocked,
      providerRequestCount: results.reduce((sum, result) => sum + result.requestCount, 0),
      candidateSelectionMs,
      sourceLookupMs: results.reduce((sum, result) => sum + result.sourceLookupMs, 0),
      repairDurationMs: results.reduce((sum, result) => sum + result.repairMs, 0),
      totalMs: this.now() - startedAt,
      before: before.summary,
      after: after.summary,
      issues: results.flatMap((result) => result.issues),
    };
  }

  private async processGroup(group: GovernedPriceCoverageCandidate[]): Promise<GroupResult> {
    if (!group.length) return { repaired: 0, requestCount: 0, sourceLookupMs: 0, repairMs: 0, issues: [] };
    const sourceStartedAt = this.now();
    const rows = await this.provider.fetchCurrentProductPrices!({
      priceTypeReference: reference(group[0]!.externalPriceTypeRef, "price-type"),
      productReferences: group.map((candidate) => reference(candidate.externalProductRef, "catalog-product")),
    });
    const sourceLookupMs = this.now() - sourceStartedAt;
    const targetPriceType = group[0]!.externalPriceTypeRef.toLowerCase();
    const byProduct = new Map(rows
      .filter((row) => row.priceTypeReference.externalId.toLowerCase() === targetPriceType)
      .map((row) => [row.productReference.externalId.toLowerCase(), row]));
    const repairable = group.flatMap((candidate) => {
      const source = byProduct.get(candidate.externalProductRef.toLowerCase());
      return isPublishableSourcePrice(source) ? [{ candidate, source }] : [];
    });
    const issues = group.flatMap((candidate) => {
      const source = byProduct.get(candidate.externalProductRef.toLowerCase());
      if (isPublishableSourcePrice(source)) return [];
      const sourcePriceExists = source !== undefined;
      return [{
        sku: candidate.sku,
        productName: candidate.productName,
        companyNames: candidate.companyNames,
        governedPriceType: candidate.priceTypeName,
        severity: candidate.activeCartCount > 0 ? "high" as const : "medium" as const,
        sourcePriceExists,
        repairable: false,
        reason: sourcePriceExists ? "SOURCE_PRICE_INACTIVE" as const : "SOURCE_PRICE_ABSENT" as const,
        requiredAction: "Create or restore the governed product price in 1C, then run the existing price synchronization.",
        safeProductFingerprint: fingerprint(candidate.externalProductRef),
      }];
    });

    let repaired = 0;
    let repairMs = 0;
    if (repairable.length) {
      const repairStartedAt = this.now();
      const verifiedAt = new Date(this.now()).toISOString();
      repaired = await this.repository.publishVerifiedPrices({
        externalPriceTypeRef: group[0]!.externalPriceTypeRef,
        verifiedAt,
        rows: repairable.map(({ candidate, source }) => ({
          externalProductRef: candidate.externalProductRef,
          amount: source.amount,
          effectiveAt: source.effectiveAt,
          isActive: source.isActive,
        })),
      });
      repairMs = this.now() - repairStartedAt;
      if (repaired !== repairable.length) {
        throw new Error("Governed price coverage repair was incomplete.");
      }
    }

    return { repaired, requestCount: 1, sourceLookupMs, repairMs, issues };
  }
}

function groupCandidates(candidates: GovernedPriceCoverageCandidate[]): GovernedPriceCoverageCandidate[][] {
  const byPriceType = new Map<string, GovernedPriceCoverageCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.externalPriceTypeRef.toLowerCase();
    const rows = byPriceType.get(key) ?? [];
    rows.push(candidate);
    byPriceType.set(key, rows);
  }
  return [...byPriceType.values()].flatMap((rows) => {
    const chunks: GovernedPriceCoverageCandidate[][] = [];
    for (let index = 0; index < rows.length; index += MAX_PRODUCTS_PER_SOURCE_REQUEST) {
      chunks.push(rows.slice(index, index + MAX_PRODUCTS_PER_SOURCE_REQUEST));
    }
    return chunks;
  });
}

function isPublishableSourcePrice(value: CurrentProductPriceDTO | undefined): value is CurrentProductPriceDTO {
  return value !== undefined && value.isActive && Number.isFinite(value.amount) && value.amount > 0;
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await mapper(values[index]!);
    }
  }));
  return result;
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 16);
}
