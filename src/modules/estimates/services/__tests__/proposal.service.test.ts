import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvalidStateError, NotFoundError } from "../../../access-control/services";
import type { EstimateRepository, ProposalRepository } from "../../repositories";
import type { EstimateAggregate, GeneratedEstimateDocument, ProposalTemplate } from "../../types";
import { DEFAULT_PROPOSAL_SETTINGS, DefaultProposalService, stableJson } from "../proposal.service";

vi.mock("../proposal-pdf.renderer", () => ({ renderProposalPdf: vi.fn().mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]), pageCount: 1 }) }));

const template: ProposalTemplate = { id: "template-1", companyId: null, key: "equipment_supply", name: "Поставка оборудования", configuration: DEFAULT_PROPOSAL_SETTINGS, isSystem: true };
const readyDocument: GeneratedEstimateDocument = { id: "doc-1", companyId: "company-1", estimateId: "estimate-1", estimateRevision: 3, versionId: null, templateId: "template-1", generationFingerprint: "a".repeat(64), status: "ready", storageBucket: "estimate-proposals", storageKey: "company-1/estimate-1/doc-1.pdf", pageCount: 1, fileSizeBytes: 4, checksumSha256: "b".repeat(64), safeError: null, createdAt: "2026-07-16T10:00:00Z" };

describe("DefaultProposalService", () => {
  let estimates: EstimateRepository; let proposals: ProposalRepository; let service: DefaultProposalService;
  beforeEach(() => {
    estimates = { findAggregateById: vi.fn().mockResolvedValue(aggregate()), findById: vi.fn().mockResolvedValue(aggregate().estimate) } as unknown as EstimateRepository;
    proposals = {
      listTemplates: vi.fn().mockResolvedValue([template]), getBranding: vi.fn().mockResolvedValue(null), getProductImages: vi.fn().mockResolvedValue(new Map([["product-1", "https://www.nsd.md/camera.png"]])),
      saveSettings: vi.fn().mockResolvedValue(4),
      copyTemplate: vi.fn().mockResolvedValue(template),
      claimGeneration: vi.fn().mockResolvedValue(readyDocument), markGenerating: vi.fn(), markReady: vi.fn(), markFailed: vi.fn(), findDocument: vi.fn().mockResolvedValue(readyDocument), uploadPdf: vi.fn(), downloadPdf: vi.fn(),
      findVersionProposal: vi.fn(), claimVersionGeneration: vi.fn(),
    };
    service = new DefaultProposalService(estimates, proposals, { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company: { id: "company-1", displayName: "Partner SRL" }, user: { fullName: "Ivan", email: "ivan@example.com", phone: "+373" } }) } as never, { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) } as never);
  });

  it("prepares one immutable customer allowlist without internal commercial fields", async () => {
    const preview = await service.preparePreview("user-1", "estimate-1");
    const serialized = JSON.stringify(preview.proposal);
    expect(preview.proposal.sections[0].lines[0]).toEqual(expect.objectContaining({ lineType: "product", sku: "400691", unitPrice: 100, lineTotal: 200 }));
    for (const forbidden of ["companyId", "productId", "external1c", "internalCost", "marginPercent", "permission", "roleId"]) expect(serialized).not.toContain(forbidden);
    expect(Object.isFrozen(preview.proposal)).toBe(true);
    expect(proposals.getProductImages).toHaveBeenCalledTimes(1);
  });

  it("enforces company boundary and complete pricing", async () => {
    vi.mocked(estimates.findAggregateById).mockResolvedValue(aggregate({ companyId: "company-2" }));
    await expect(service.preparePreview("user-1", "estimate-1")).rejects.toBeInstanceOf(NotFoundError);
    vi.mocked(estimates.findAggregateById).mockResolvedValue(aggregate({ hasIncompletePricing: true }));
    await expect(service.preparePreview("user-1", "estimate-1")).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("removes untrusted and credential-bearing image URLs from the customer DTO", async () => {
    vi.mocked(proposals.getProductImages).mockResolvedValue(new Map([["product-1", "https://attacker.example/image.png"]]));
    expect((await service.preparePreview("user-1", "estimate-1")).proposal.sections[0].lines[0].imageUrl).toBeNull();
    vi.mocked(proposals.getProductImages).mockResolvedValue(new Map([["product-1", "https://www.nsd.md/image.png?token=secret"]]));
    expect((await service.preparePreview("user-1", "estimate-1")).proposal.sections[0].lines[0].imageUrl).toBeNull();
  });

  it("accepts the same allowlisted Firebase product source used by catalog thumbnails", async () => {
    const image = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera_thumb.jpg?alt=media&token=public-token";
    vi.mocked(proposals.getProductImages).mockResolvedValue(new Map([["product-1", image]]));
    expect((await service.preparePreview("user-1", "estimate-1")).proposal.sections[0].lines[0].imageUrl).toBe(image);
  });

  it("saves one settings batch without touching estimate lines", async () => {
    await service.saveSettings("user-1", "estimate-1", 3, template.id, DEFAULT_PROPOSAL_SETTINGS);
    expect(proposals.saveSettings).toHaveBeenCalledTimes(1);
    expect(estimates.findAggregateById).not.toHaveBeenCalled();
  });

  it("blocks PDF generation from a mutable draft", async () => {
    await expect(service.generatePdf("user-1", "estimate-1")).rejects.toBeInstanceOf(InvalidStateError);
    expect(proposals.claimGeneration).not.toHaveBeenCalled();
  });

  it("canonicalizes nested DTOs for stable deduplication", () => {
    expect(stableJson({ b: { y: 2, x: 1 }, a: [2, 1] })).toBe(stableJson({ a: [2, 1], b: { x: 1, y: 2 } }));
  });
});

function aggregate(overrides: Partial<EstimateAggregate["estimate"]> = {}): EstimateAggregate {
  const now = "2026-07-16T10:00:00Z";
  return {
    estimate: { id: "estimate-1", companyId: "company-1", createdBy: "user-1", estimateNumber: "KP-2026-000001", name: "CCTV", customerName: "Customer", projectName: "Site", currencyCode: "USD", currencyRate: 1, currencyRateEffectiveDate: "2026-07-16", validityDays: 14, globalDiscountPercent: 0, vatMode: "separate", vatRatePercent: 20, subtotalAmount: 200, lineDiscountTotal: 0, sectionDiscountTotal: 0, globalDiscountAmount: 0, chargesTotal: 20, vatAmount: 44, totalExcludingVat: 220, grossProfitAmount: 40, overallMarginPercent: 20, status: "draft", totalAmount: 264, hasIncompletePricing: false, revision: 3, archivedAt: null, createdAt: now, updatedAt: now, ...overrides },
    sections: [{ id: "section-1", estimateId: "estimate-1", name: "Оборудование", sortOrder: 0, showSubtotal: true, discountPercent: 0, createdAt: now, updatedAt: now }],
    items: [{ id: "item-1", estimateId: "estimate-1", sectionId: "section-1", lineType: "product", productId: "product-1", serviceId: null, position: 1, skuSnapshot: "400691", productNameSnapshot: "Camera", sourceUnitPrice: 80, sourceCurrencyCode: "USD", sourceSnapshotAt: now, pricingMode: "direct", pricingInputValue: 100, internalCostUnitPrice: 80, convertedCostUnitPrice: 80, exchangeRate: 1, exchangeRateEffectiveDate: "2026-07-16", lineDiscountPercent: 0, description: "Камера", quantity: 2, unit: "pcs", sellingUnitPrice: 100, lineTotal: 200, lineSubtotal: 200, lineDiscountAmount: 0, createdAt: now, updatedAt: now }],
    charges: [{ id: "charge-1", estimateId: "estimate-1", chargeType: "delivery", description: "Доставка", amount: 20, vatApplicable: true, customerVisible: true, sortOrder: 0, createdAt: now, updatedAt: now }],
  };
}
