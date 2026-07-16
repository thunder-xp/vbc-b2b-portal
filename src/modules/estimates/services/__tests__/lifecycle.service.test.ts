import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "../../../access-control/services";
import type { EstimateLifecycleRepository, EstimateRepository } from "../../repositories";
import type { CustomerProposalDto, Estimate, EstimateVersion } from "../../types";
import { EstimateLifecycleService } from "../lifecycle.service";

describe("EstimateLifecycleService", () => {
  it.each([20, 100, 300])("creates one exact %i-line version without per-line writes", async (lineCount) => {
    const dependencies = makeDependencies(lineCount);
    const result = await dependencies.service.createVersion("user-1", "estimate-1", 3, "Offer", "Rates changed");
    expect(result.versionNumber).toBe(1);
    expect(dependencies.lifecycle.createVersion).toHaveBeenCalledOnce();
    expect(dependencies.lifecycle.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      estimateId: "estimate-1", expectedRevision: 3, note: "Offer", changeReason: "Rates changed",
      customerProposalSnapshot: dependencies.proposal,
    }));
    expect(dependencies.proposalService.preparePreview).toHaveBeenCalledOnce();
    expect(dependencies.estimates.findAggregateById).not.toHaveBeenCalled();
  });

  it("delegates valid transitions to one guarded repository operation", async () => {
    const dependencies = makeDependencies();
    await dependencies.service.transitionVersion("user-1", "version-1", "sent", "email", "Customer");
    expect(dependencies.lifecycle.transitionVersion).toHaveBeenCalledWith({ versionId: "version-1", status: "sent", channel: "email", note: "Customer" });
  });

  it("denies cross-company duplication and version access", async () => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.estimates.findById).mockResolvedValue({ ...dependencies.estimate, companyId: "company-2" });
    await expect(dependencies.service.duplicateEstimate("user-1", "estimate-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(dependencies.lifecycle.duplicate).not.toHaveBeenCalled();
  });

  it("refreshes version product prices with one catalog and one commercial batch", async () => {
    const dependencies = makeDependencies();
    await dependencies.service.createDraftFromVersion("user-1", "version-1");
    expect(dependencies.catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(dependencies.pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(dependencies.lifecycle.restoreDraft).toHaveBeenCalledWith("version-1", [expect.objectContaining({ productId: "product-1", amount: 12 })]);
  });

  it("creates an estimate from the cart without mutating or submitting the cart", async () => {
    const dependencies = makeDependencies();
    await dependencies.service.createEstimateFromCart("user-1", "Site estimate", "11111111-1111-1111-1111-111111111111");
    expect(dependencies.cart.getEstimateSource).toHaveBeenCalledOnce();
    expect(dependencies.lifecycle.createFromCart).toHaveBeenCalledWith(expect.objectContaining({
      cartId: "cart-1", name: "Site estimate", lines: [expect.objectContaining({ productId: "product-1", quantity: 2, partnerPrice: 12 })],
    }));
    expect(dependencies.cart.addItem).not.toHaveBeenCalled();
  });

  it("passes only product lines to the cart conversion service", async () => {
    const dependencies = makeDependencies();
    await dependencies.service.addEquipmentToCart("user-1", "estimate-1", "version-1", "22222222-2222-2222-2222-222222222222");
    expect(dependencies.cart.mergeEstimateProducts).toHaveBeenCalledWith("user-1", expect.objectContaining({
      estimateId: "estimate-1", versionId: "version-1",
      lines: [{ productId: "product-1", quantity: 2, snapshotPartnerPrice: 10 }],
    }));
  });
});

function makeDependencies(lineCount = 1) {
  const estimate = makeEstimate();
  const proposal = makeProposal(lineCount);
  const version = makeVersion(proposal);
  const aggregate = {
    estimate,
    sections: [{ id: "section-1", estimateId: estimate.id, name: "Equipment", sortOrder: 0, showSubtotal: true, discountPercent: 0, createdAt: estimate.createdAt, updatedAt: estimate.updatedAt }],
    items: Array.from({ length: lineCount }, (_, index) => ({ id: `item-${index}`, estimateId: estimate.id, sectionId: "section-1", lineType: index ? "service" : "product", productId: index ? null : "product-1", serviceId: null, position: index + 1, skuSnapshot: index ? null : "SKU-1", productNameSnapshot: index ? null : "Camera", sourceUnitPrice: index ? null : 10, sourceCurrencyCode: index ? null : "USD", sourceSnapshotAt: estimate.updatedAt, pricingMode: "direct", pricingInputValue: 10, internalCostUnitPrice: 10, convertedCostUnitPrice: 10, exchangeRate: 1, exchangeRateEffectiveDate: "2026-07-16", lineDiscountPercent: 0, description: "Line", quantity: 2, unit: "pcs", sellingUnitPrice: 10, lineTotal: 20, lineSubtotal: 20, lineDiscountAmount: 0, createdAt: estimate.createdAt, updatedAt: estimate.updatedAt })),
    charges: [],
  };
  const lifecycle = {
    listVersions: vi.fn().mockResolvedValue([version]), findVersion: vi.fn().mockResolvedValue(version), listLatestDocuments: vi.fn().mockResolvedValue(new Map()),
    createVersion: vi.fn().mockResolvedValue(version), markReady: vi.fn().mockResolvedValue(estimate), transitionVersion: vi.fn().mockResolvedValue(version),
    restoreDraft: vi.fn().mockResolvedValue(estimate), duplicate: vi.fn().mockResolvedValue({ ...estimate, id: "estimate-copy" }), createTemplate: vi.fn(), createFromCart: vi.fn().mockResolvedValue(estimate),
  } satisfies EstimateLifecycleRepository;
  const estimates = { findById: vi.fn().mockResolvedValue(estimate), findAggregateById: vi.fn().mockResolvedValue(aggregate) } as unknown as EstimateRepository;
  const proposalService = { preparePreview: vi.fn().mockResolvedValue({ proposal }) };
  const cart = {
    getEstimateSource: vi.fn().mockResolvedValue({ companyId: "company-1", cartId: "cart-1", lines: [{ productId: "product-1", sku: "SKU-1", productName: "Camera", quantity: 2, partnerPrice: 12, currencyCode: "USD", priceUpdatedAt: "2026-07-16T10:00:00Z" }] }),
    mergeEstimateProducts: vi.fn().mockResolvedValue({ cartId: "cart-1", added: 1, updated: 0, unavailable: 0, inactive: 0, missingPrice: 0, skipped: 0, changedPrice: 1 }), addItem: vi.fn(),
  };
  const catalog = { getProductsByIds: vi.fn().mockResolvedValue([{ id: "product-1" }]) };
  const pricing = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: "product-1", partnerPrice: { amount: 12, currencyCode: "USD", lastUpdatedAt: "2026-07-16T10:00:00Z" } }]) };
  const service = new EstimateLifecycleService(lifecycle, estimates, proposalService as never, cart as never,
    { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1" } }) } as never,
    { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) } as never, catalog as never, pricing as never);
  return { service, lifecycle, estimates, proposal, proposalService, estimate, cart, catalog, pricing };
}

function makeEstimate(): Estimate {
  return { id: "estimate-1", companyId: "company-1", createdBy: "user-1", estimateNumber: "KP-2026-000001", name: "Site", customerName: "Customer", projectName: "Site", currencyCode: "USD", currencyRate: 1, currencyRateEffectiveDate: "2026-07-16", validityDays: 14, globalDiscountPercent: 0, vatMode: "separate", vatRatePercent: 20, subtotalAmount: 20, lineDiscountTotal: 0, sectionDiscountTotal: 0, globalDiscountAmount: 0, chargesTotal: 0, vatAmount: 4, totalExcludingVat: 20, grossProfitAmount: 4, overallMarginPercent: 20, status: "draft", totalAmount: 24, hasIncompletePricing: false, proposalTemplateId: null, proposalSettings: {}, sourceEstimateId: null, sourceVersionId: null, acceptedVersionId: null, revision: 3, archivedAt: null, createdAt: "2026-07-16T10:00:00Z", updatedAt: "2026-07-16T10:00:00Z" };
}

function makeProposal(lineCount: number): CustomerProposalDto {
  return { schemaVersion: "2026-07-16-v1", estimateNumber: "KP-2026-000001", generatedForDate: "2026-07-16", customerName: "Customer", projectName: "Site", currencyCode: "USD", settings: { paymentTerms: "Prepayment", deliveryTerms: "Agreement" } as CustomerProposalDto["settings"], branding: { companyName: "Partner", legalName: null, contactName: null, phone: null, email: null, website: null, fiscalInformation: null, address: null, logoUrl: null }, sections: [{ name: "Equipment", subtotal: lineCount * 20, lines: Array.from({ length: lineCount }, (_, index) => ({ position: index + 1, description: "Line", sku: "SKU", imageUrl: null, quantity: 2, unitLabel: "pcs", unitPrice: 10, lineDiscountPercent: 0, lineTotal: 20 })) }], charges: [], totals: { subtotal: 20, discounts: 0, charges: 0, totalExcludingVat: 20, vat: 4, total: 24 } };
}

function makeVersion(proposal: CustomerProposalDto): EstimateVersion {
  return { id: "version-1", estimateId: "estimate-1", companyId: "company-1", versionNumber: 1, estimateRevision: 3, status: "prepared", estimateNumber: "KP-2026-000001", currencyCode: "USD", totalAmount: 24, snapshot: { estimate: {}, sections: [], items: [{ line_type: "product", product_id: "product-1", quantity: 2, source_unit_price: 10 }, { line_type: "service", quantity: 1 }], charges: [] }, customerProposalSnapshot: proposal, proposalTemplateId: null, note: null, changeReason: null, createdBy: "user-1", createdByName: "Partner User", createdAt: "2026-07-16T10:00:00Z", sentAt: null, sentChannel: null, acceptedAt: null, rejectedAt: null, rejectionReason: null };
}
