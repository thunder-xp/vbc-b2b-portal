import { describe, expect, it, vi } from "vitest";

import type { PartnerSearchRepository } from "../../repositories/partner-search.repository";
import { PartnerSearchService, normalizeSearchQuery } from "../partner-search.service";

describe("PartnerSearchService", () => {
  it("uses one bounded repository query and groups results by business type", async () => {
    const repository: PartnerSearchRepository = {
      search: vi.fn().mockResolvedValue([
        { documentType: "manual_line", documentId: "line", title: "Монтаж", subtitle: null, route: "/cabinet/estimates/e", updatedAt: "2026-07-31" },
        { documentType: "product", documentId: "product", title: "Camera", subtitle: "SKU 400", route: "/cabinet/catalog/camera", updatedAt: "2026-07-31" },
        { documentType: "estimate", documentId: "estimate", title: "Office", subtitle: "KP-1", route: "/cabinet/estimates/e", updatedAt: "2026-07-31" },
      ]),
    };
    const groups = await new PartnerSearchService(repository).search("company", "  camera  ");
    expect(repository.search).toHaveBeenCalledOnce();
    expect(repository.search).toHaveBeenCalledWith("company", "camera", 40);
    expect(groups.map((group) => group.type)).toEqual(["product", "estimate", "manual_line"]);
  });

  it("does not query for short input and normalizes bounded text", async () => {
    const repository: PartnerSearchRepository = { search: vi.fn() };
    expect(await new PartnerSearchService(repository).search("company", " x ")).toEqual([]);
    expect(repository.search).not.toHaveBeenCalled();
    expect(normalizeSearchQuery(`  one   ${"x".repeat(150)}  `)).toHaveLength(100);
  });
});
