import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PricingProvider } from "../../contracts";
import type {
  GovernedPriceCoverageCandidate,
  GovernedPriceCoverageSnapshot,
  PriceCoverageAuditRepository,
} from "../price-coverage-audit.repository";
import { PriceCoverageAuditService } from "../price-coverage-audit.service";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";
const PRICE_TYPE = "33333333-3333-4333-8333-333333333333";

describe("governed price coverage audit", () => {
  let provider: PricingProvider;
  let repository: PriceCoverageAuditRepository;

  beforeEach(() => {
    provider = {
      fetchProductPrices: vi.fn(),
      fetchCurrentProductPrices: vi.fn(),
    };
    repository = {
      listCandidates: vi.fn(),
      getSnapshot: vi.fn(),
      publishVerifiedPrices: vi.fn(),
    };
  });

  it("classifies a missing authoritative source price as irreparable without publishing a fallback", async () => {
    vi.mocked(repository.getSnapshot)
      .mockResolvedValueOnce(snapshot(1))
      .mockResolvedValueOnce(snapshot(1));
    vi.mocked(repository.listCandidates)
      .mockResolvedValueOnce([candidate(PRODUCT_A)])
      .mockResolvedValueOnce([candidate(PRODUCT_A)]);
    vi.mocked(provider.fetchCurrentProductPrices!).mockResolvedValue([]);

    const result = await new PriceCoverageAuditService(provider, repository).run(100);

    expect(result).toMatchObject({
      priceCoverageReady: false,
      candidateCount: 1,
      autoRepaired: 0,
      irreparableSourceGaps: 1,
      repairableProjectionGaps: 0,
      activeCartsBlocked: 1,
      providerRequestCount: 1,
    });
    expect(result.issues[0]).toMatchObject({
      reason: "SOURCE_PRICE_ABSENT",
      sourcePriceExists: false,
      repairable: false,
      severity: "high",
    });
    expect(repository.publishVerifiedPrices).not.toHaveBeenCalled();
  });

  it("repairs an existing authoritative source price through the governed publication boundary", async () => {
    vi.mocked(repository.getSnapshot)
      .mockResolvedValueOnce(snapshot(1))
      .mockResolvedValueOnce(snapshot(0));
    vi.mocked(repository.listCandidates)
      .mockResolvedValueOnce([candidate(PRODUCT_A)])
      .mockResolvedValueOnce([]);
    vi.mocked(provider.fetchCurrentProductPrices!).mockResolvedValue([
      sourcePrice(PRODUCT_A, PRICE_TYPE, 125),
    ]);
    vi.mocked(repository.publishVerifiedPrices).mockResolvedValue(1);

    const result = await new PriceCoverageAuditService(provider, repository).run(100);

    expect(result).toMatchObject({
      priceCoverageReady: true,
      autoRepaired: 1,
      irreparableSourceGaps: 0,
      repairableProjectionGaps: 0,
      activeCartsBlocked: 0,
    });
    expect(repository.publishVerifiedPrices).toHaveBeenCalledWith(expect.objectContaining({
      externalPriceTypeRef: PRICE_TYPE,
      rows: [{
        externalProductRef: PRODUCT_A,
        amount: 125,
        effectiveAt: "2026-09-04T00:00:00.000Z",
        isActive: true,
      }],
    }));
  });

  it("batches candidates by governed price type and repairs valid rows without hiding source gaps", async () => {
    vi.mocked(repository.getSnapshot)
      .mockResolvedValueOnce(snapshot(2))
      .mockResolvedValueOnce(snapshot(1));
    vi.mocked(repository.listCandidates)
      .mockResolvedValueOnce([candidate(PRODUCT_A), candidate(PRODUCT_B)])
      .mockResolvedValueOnce([candidate(PRODUCT_B)]);
    vi.mocked(provider.fetchCurrentProductPrices!).mockResolvedValue([
      sourcePrice(PRODUCT_A, PRICE_TYPE, 125),
    ]);
    vi.mocked(repository.publishVerifiedPrices).mockResolvedValue(1);

    const result = await new PriceCoverageAuditService(provider, repository).run(100);

    expect(provider.fetchCurrentProductPrices).toHaveBeenCalledTimes(1);
    expect(provider.fetchCurrentProductPrices).toHaveBeenCalledWith(expect.objectContaining({
      productReferences: expect.arrayContaining([
        expect.objectContaining({ externalId: PRODUCT_A }),
        expect.objectContaining({ externalId: PRODUCT_B }),
      ]),
    }));
    expect(result).toMatchObject({ autoRepaired: 1, irreparableSourceGaps: 1, providerRequestCount: 1 });
  });

  it("rejects a source row from the wrong price type instead of substituting it", async () => {
    vi.mocked(repository.getSnapshot)
      .mockResolvedValueOnce(snapshot(1))
      .mockResolvedValueOnce(snapshot(1));
    vi.mocked(repository.listCandidates)
      .mockResolvedValueOnce([candidate(PRODUCT_A)])
      .mockResolvedValueOnce([candidate(PRODUCT_A)]);
    vi.mocked(provider.fetchCurrentProductPrices!).mockResolvedValue([
      sourcePrice(PRODUCT_A, "44444444-4444-4444-8444-444444444444", 999),
    ]);

    const result = await new PriceCoverageAuditService(provider, repository).run(100);

    expect(result.issues[0]).toMatchObject({ reason: "SOURCE_PRICE_ABSENT", repairable: false });
    expect(repository.publishVerifiedPrices).not.toHaveBeenCalled();
  });

  it("treats an inactive source row as irreparable and keeps the cart blocked", async () => {
    vi.mocked(repository.getSnapshot)
      .mockResolvedValueOnce(snapshot(1))
      .mockResolvedValueOnce(snapshot(1));
    vi.mocked(repository.listCandidates)
      .mockResolvedValueOnce([candidate(PRODUCT_A)])
      .mockResolvedValueOnce([candidate(PRODUCT_A)]);
    vi.mocked(provider.fetchCurrentProductPrices!).mockResolvedValue([
      { ...sourcePrice(PRODUCT_A, PRICE_TYPE, 125), isActive: false },
    ]);

    const result = await new PriceCoverageAuditService(provider, repository).run(100);

    expect(result.issues[0]).toMatchObject({
      reason: "SOURCE_PRICE_INACTIVE",
      sourcePriceExists: true,
      repairable: false,
    });
    expect(result.activeCartsBlocked).toBe(1);
    expect(repository.publishVerifiedPrices).not.toHaveBeenCalled();
  });
});

function candidate(productRef: string): GovernedPriceCoverageCandidate {
  return {
    productId: productRef,
    sku: productRef === PRODUCT_A ? "400713" : "400714",
    productName: productRef === PRODUCT_A ? "IPC-PT2849C1-S-PV-PRO" : "Camera B",
    externalProductRef: productRef,
    externalPriceTypeRef: PRICE_TYPE,
    priceTypeName: "PLATINUM",
    priority: 1,
    activeCartCount: 1,
    activeCartLineCount: 1,
    recentOrderCount: 0,
    totalQuantity: 1,
    companyIds: ["55555555-5555-4555-8555-555555555555"],
    companyNames: ["MULTI-SECURITY"],
    latestExposureAt: "2026-09-01T09:13:44.000Z",
  };
}

function snapshot(blocked: number): GovernedPriceCoverageSnapshot {
  return {
    generatedAt: "2026-09-04T00:00:00.000Z",
    summary: {
      activeOrderCapableCompanies: 38,
      activeCarts: 26,
      nonEmptyActiveCarts: 9,
      totalCartLines: 27,
      linesWithProductMapping: 27,
      linesWithGovernedPrice: 27 - blocked,
      missingGovernedPriceLines: blocked,
      uniqueAffectedCompanies: blocked,
      uniqueAffectedProducts: blocked,
      activeCartsBlocked: blocked,
      governedValueExposureByCurrency: [{ currency: "USD", amount: 5758.84 }],
    },
    catalogCoverage: {
      publishedActiveProducts: 100,
      currentlyUsedPartnerPriceTypes: 4,
      potentialProductPriceTypePairs: 400,
      observedEligiblePairs: 300,
      meaningfulBuyingContextPairs: 20,
      meaningfulMissingPairs: blocked,
      theoreticalGapsTreatedAsIssues: false,
    },
    issues: [],
  };
}

function sourcePrice(productRef: string, priceTypeRef: string, amount: number) {
  return {
    productReference: reference(productRef, "catalog-product"),
    priceTypeReference: reference(priceTypeRef, "price-type"),
    amount,
    effectiveAt: "2026-09-04T00:00:00.000Z",
    isActive: true,
  };
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}
