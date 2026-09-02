import { describe, expect, it, vi } from "vitest";

import type { EstimateSalesOpportunityRepository } from "../repository";
import { PartnerSalesWorkspaceService } from "../service";
import type { EstimateSalesOpportunitySource } from "../types";

const base: EstimateSalesOpportunitySource = {
  versionId: "version-1", estimateId: "estimate-1", estimateNumber: "KP-1", proposalName: "Office CCTV", customerName: "Client SRL",
  projectName: "Office", amount: 38400, currency: "MDL", versionStatus: "prepared", estimateLifecycleStatus: "draft", sentAt: null,
  createdAt: "2026-09-01T10:00:00Z", readyDocumentId: "document-1",
};

function repository(rows: EstimateSalesOpportunitySource[]): EstimateSalesOpportunityRepository {
  return { listCurrent: vi.fn().mockResolvedValue(rows) };
}

describe("PartnerSalesWorkspaceService", () => {
  it("derives ready-to-send and awaiting-customer opportunities from governed lifecycle truth", async () => {
    const repo = repository([base, { ...base, versionId: "version-2", estimateId: "estimate-2", estimateNumber: "KP-2", versionStatus: "sent", estimateLifecycleStatus: "sent", sentAt: "2026-08-28T10:00:00Z", readyDocumentId: null }]);
    const result = await new PartnerSalesWorkspaceService(repo).listEstimateOpportunities("company-1", { canView: true, canSend: true });
    expect(repo.listCurrent).toHaveBeenCalledWith("company-1", 6);
    expect(result).toEqual([
      expect.objectContaining({ id: "ready_to_send:version-1", type: "ready_to_send", amount: 38400, currency: "MDL", customerName: "Client SRL", href: "/cabinet/estimates/estimate-1" }),
      expect.objectContaining({ id: "awaiting_customer:version-2", type: "awaiting_customer", href: "/cabinet/estimates/estimate-2", waitingSince: "2026-08-28T10:00:00Z" }),
    ]);
  });

  it("excludes non-actionable truth, keeps only the latest version, and bounds deterministic results", async () => {
    const rows = [
      { ...base, readyDocumentId: null },
      { ...base, versionId: "old-version", createdAt: "2026-08-01T10:00:00Z" },
      ...Array.from({ length: 9 }, (_, index) => ({ ...base, versionId: `version-${index + 10}`, estimateId: `estimate-${index + 10}`, createdAt: `2026-08-${String(index + 10).padStart(2, "0")}T10:00:00Z` })),
    ];
    const result = await new PartnerSalesWorkspaceService(repository(rows)).listEstimateOpportunities("company-1", { canView: true, canSend: true }, 5);
    expect(result).toHaveLength(5);
    expect(result.some((item) => item.versionId === "old-version")).toBe(false);
    expect(result.map((item) => item.id)).toEqual([...result.map((item) => item.id)].sort((a, b) => {
      const left = result.find((item) => item.id === a)!; const right = result.find((item) => item.id === b)!;
      return left.waitingSince.localeCompare(right.waitingSince) || a.localeCompare(b);
    }));
  });

  it("fails closed on permissions and only exposes send-ready work to proposal senders", async () => {
    const repo = repository([base, { ...base, versionId: "version-2", estimateId: "estimate-2", versionStatus: "sent", estimateLifecycleStatus: "sent", sentAt: "2026-08-28T10:00:00Z" }]);
    const service = new PartnerSalesWorkspaceService(repo);

    await expect(service.listEstimateOpportunities("company-1", { canView: false, canSend: true })).resolves.toEqual([]);
    expect(repo.listCurrent).not.toHaveBeenCalled();

    const viewOnly = await service.listEstimateOpportunities("company-1", { canView: true, canSend: false });
    expect(viewOnly.map((item) => item.type)).toEqual(["awaiting_customer"]);
  });

  it("replaces ready-to-send with awaiting-customer when governed state becomes sent", async () => {
    const service = new PartnerSalesWorkspaceService(repository([base]));
    const ready = await service.listEstimateOpportunities("company-1", { canView: true, canSend: true });
    expect(ready.map((item) => item.type)).toEqual(["ready_to_send"]);

    const sentService = new PartnerSalesWorkspaceService(repository([{
      ...base,
      versionStatus: "sent",
      estimateLifecycleStatus: "sent",
      sentAt: "2026-09-02T10:00:00Z",
    }]));
    const sent = await sentService.listEstimateOpportunities("company-1", { canView: true, canSend: true });
    expect(sent.map((item) => item.type)).toEqual(["awaiting_customer"]);
    expect(sent.some((item) => item.id === "ready_to_send:version-1")).toBe(false);
  });

  it.each(["accepted", "rejected", "expired", "converted_to_order"] as const)(
    "removes an awaiting opportunity when the estimate becomes %s",
    async (estimateLifecycleStatus) => {
      const terminal = { ...base, versionStatus: "sent" as const, estimateLifecycleStatus, sentAt: "2026-08-28T10:00:00Z" };
      await expect(new PartnerSalesWorkspaceService(repository([terminal])).listEstimateOpportunities(
        "company-1",
        { canView: true, canSend: true },
      )).resolves.toEqual([]);
    },
  );
});
