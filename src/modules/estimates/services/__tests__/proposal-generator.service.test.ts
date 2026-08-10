import { describe, expect, it, vi } from "vitest";

import { ProposalGeneratorService } from "../proposal-generator.service";

const uuid = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;

describe("ProposalGeneratorService", () => {
  it("resolves catalog and external identities in bounded batches and initializes RETAIL selling price", async () => {
    const createEstimate = vi.fn().mockResolvedValue(uuid("9"));
    const resolveExternalNomenclature = vi.fn().mockResolvedValue([{ id: uuid("3"), name: "Монтаж камеры", unit: "service", itemType: "service" }]);
    const repository = { createEstimate, resolveExternalNomenclature };
    const companyAccess = {
      getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: uuid("4"), status: "active" }]),
      getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: uuid("4") } }),
    };
    const permissions = {
      ensurePermission: vi.fn(),
      getEffectivePermissionContext: vi.fn().mockResolvedValue({ userId: uuid("1"), companyId: uuid("4"), effectivePermissionCodes: ["pricing.partner_price.view"] }),
    };
    const catalog = { getProductsByIds: vi.fn().mockResolvedValue([{ id: uuid("2"), sku: "CAM-1", name: "Камера" }]) };
    const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: uuid("2"), retailPrice: { amount: 150, currencyCode: "USD" }, partnerPrice: null }]) };
    const service = new ProposalGeneratorService(repository as never, companyAccess as never, permissions as never, catalog as never, pricing as never);
    const result = await service.createEstimate(uuid("1"), {
      sessionId: uuid("5"), sessionFingerprint: "a".repeat(64), finalCustomerId: uuid("6"), name: "Склад", currencyCode: "USD", validityDays: 14, requestKey: uuid("7"),
      requirements: [
        { id: "one", sectionKey: "equipment", description: "Камера", quantity: 2, unit: "pcs", resolution: "catalog", resolvedId: uuid("2"), resolvedLabel: "CAM-1" },
        { id: "two", sectionKey: "installation_works", description: "Монтаж", quantity: 2, unit: "service", resolution: "own_nomenclature", resolvedId: uuid("3"), resolvedLabel: "Монтаж камеры" },
        { id: "three", sectionKey: "equipment", description: "Архив 30 дней", quantity: 1, unit: "pcs", resolution: "unresolved", resolvedId: null, resolvedLabel: null },
      ],
    });
    expect(catalog.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(pricing.getProductCommercialViews).toHaveBeenCalledTimes(1);
    expect(resolveExternalNomenclature).toHaveBeenCalledTimes(1);
    const submitted = createEstimate.mock.calls[0][0];
    expect(submitted.lines[0]).toMatchObject({ lineType: "product", sellingUnitPrice: 150, sourceUnitPrice: null });
    expect(submitted.lines[1]).toMatchObject({ lineType: "external", sellingUnitPrice: null, externalNomenclatureId: uuid("3") });
    expect(submitted.lines[2]).toMatchObject({ lineType: "custom", sellingUnitPrice: null });
    expect(result.counts).toEqual({ catalog: 1, own: 1, shared: 0, unresolved: 1 });
  });
});
