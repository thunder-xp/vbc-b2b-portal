import { describe, expect, it, vi } from "vitest";

import type { EstimateSalesOpportunityRepository } from "../repository";
import { PartnerSalesWorkspaceService } from "../service";
import type { EstimateSalesOpportunityPermissions, EstimateSalesOpportunitySource } from "../types";

const base: EstimateSalesOpportunitySource = {
  versionId: "version-1", estimateId: "estimate-1", estimateNumber: "KP-1", proposalName: "Office CCTV", customerName: "Client SRL",
  projectName: "Office", amount: 38400, currency: "MDL", versionStatus: "prepared", estimateLifecycleStatus: "draft", acceptedVersionId: null,
  sentAt: null, acceptedAt: null, estimateStatus: "ready", createdAt: "2026-09-01T10:00:00Z", readyDocumentId: "document-1",
};
const allowed: EstimateSalesOpportunityPermissions = { canView: true, canSend: true, canConvert: true, canManageOrders: true };

function accepted(overrides: Partial<EstimateSalesOpportunitySource> = {}): EstimateSalesOpportunitySource {
  return {
    ...base,
    versionStatus: "accepted",
    estimateLifecycleStatus: "accepted",
    acceptedVersionId: base.versionId,
    acceptedAt: "2026-09-02T10:00:00Z",
    readyDocumentId: null,
    ...overrides,
  };
}

function repository(rows: EstimateSalesOpportunitySource[]): EstimateSalesOpportunityRepository {
  return { listCurrent: vi.fn().mockResolvedValue(rows) };
}

describe("PartnerSalesWorkspaceService", () => {
  it("derives all three opportunity types and opens accepted work at the governed conversion panel", async () => {
    const repo = repository([
      accepted(),
      { ...base, versionId: "version-2", estimateId: "estimate-2", estimateNumber: "KP-2" },
      { ...base, versionId: "version-3", estimateId: "estimate-3", estimateNumber: "KP-3", versionStatus: "sent", estimateLifecycleStatus: "sent", sentAt: "2026-08-28T10:00:00Z", readyDocumentId: null },
    ]);
    const result = await new PartnerSalesWorkspaceService(repo).listEstimateOpportunities("company-1", allowed);

    expect(repo.listCurrent).toHaveBeenCalledWith("company-1", 6);
    expect(result).toEqual([
      expect.objectContaining({ id: "accepted_ready_to_order:version-1", type: "accepted_ready_to_order", priority: 1, amount: 38400, currency: "MDL", customerName: "Client SRL", href: "/cabinet/estimates/estimate-1#estimate-order-conversion", waitingSince: "2026-09-02T10:00:00Z" }),
      expect.objectContaining({ id: "ready_to_send:version-2", type: "ready_to_send", priority: 2, href: "/cabinet/estimates/estimate-2" }),
      expect.objectContaining({ id: "awaiting_customer:version-3", type: "awaiting_customer", priority: 3, href: "/cabinet/estimates/estimate-3" }),
    ]);
  });

  it("requires the accepted immutable version to match the Estimate accepted-version pointer", async () => {
    await expect(new PartnerSalesWorkspaceService(repository([accepted({ acceptedVersionId: "version-newer" })])).listEstimateOpportunities(
      "company-1",
      allowed,
    )).resolves.toEqual([]);
  });

  it.each(["draft", "sent", "rejected", "expired", "converted_to_order"] as const)(
    "does not project accepted-order work from Estimate lifecycle %s",
    async (estimateLifecycleStatus) => {
      await expect(new PartnerSalesWorkspaceService(repository([accepted({ estimateLifecycleStatus })])).listEstimateOpportunities(
        "company-1",
        allowed,
      )).resolves.toEqual([]);
    },
  );

  it("removes the accepted opportunity when confirmed order truth advances the lifecycle", async () => {
    const service = (row: EstimateSalesOpportunitySource) => new PartnerSalesWorkspaceService(repository([row])).listEstimateOpportunities("company-1", allowed);
    await expect(service(accepted())).resolves.toEqual([expect.objectContaining({ type: "accepted_ready_to_order" })]);
    await expect(service(accepted({ estimateLifecycleStatus: "converted_to_order" }))).resolves.toEqual([]);
  });

  it("fails closed on view, Estimate conversion, and cart/order permissions", async () => {
    const repo = repository([accepted()]);
    const service = new PartnerSalesWorkspaceService(repo);

    await expect(service.listEstimateOpportunities("company-1", { ...allowed, canView: false })).resolves.toEqual([]);
    expect(repo.listCurrent).not.toHaveBeenCalled();
    await expect(service.listEstimateOpportunities("company-1", { ...allowed, canConvert: false })).resolves.toEqual([]);
    await expect(service.listEstimateOpportunities("company-1", { ...allowed, canManageOrders: false })).resolves.toEqual([]);
    await expect(service.listEstimateOpportunities("company-1", { ...allowed, canSend: false })).resolves.toEqual([
      expect.objectContaining({ type: "accepted_ready_to_order" }),
    ]);
  });

  it("keeps only the latest version and never revives accepted work after a restored draft", async () => {
    const restoredDraft = { ...base, versionId: "version-2", createdAt: "2026-09-03T10:00:00Z", readyDocumentId: null };
    const result = await new PartnerSalesWorkspaceService(repository([restoredDraft, accepted({ createdAt: "2026-09-02T10:00:00Z" })]))
      .listEstimateOpportunities("company-1", allowed);
    expect(result).toEqual([]);
  });

  it("ranks by revenue proximity, then value, remains deterministic, and keeps the queue bounded", async () => {
    const rows = [
      accepted({ versionId: "accepted-low", estimateId: "estimate-low", acceptedVersionId: "accepted-low", amount: 1000 }),
      accepted({ versionId: "accepted-high", estimateId: "estimate-high", acceptedVersionId: "accepted-high", amount: 5000 }),
      ...Array.from({ length: 7 }, (_, index) => ({ ...base, versionId: `ready-${index}`, estimateId: `ready-estimate-${index}`, amount: 9000 - index })),
    ];
    const result = await new PartnerSalesWorkspaceService(repository(rows)).listEstimateOpportunities("company-1", allowed, 6);

    expect(result).toHaveLength(6);
    expect(result.slice(0, 2).map((item) => item.id)).toEqual([
      "accepted_ready_to_order:accepted-high",
      "accepted_ready_to_order:accepted-low",
    ]);
    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
  });

  it("excludes archived estimates even when accepted lifecycle fields still look actionable", async () => {
    await expect(new PartnerSalesWorkspaceService(repository([accepted({ estimateStatus: "archived" })])).listEstimateOpportunities(
      "company-1",
      allowed,
    )).resolves.toEqual([]);
  });
});
