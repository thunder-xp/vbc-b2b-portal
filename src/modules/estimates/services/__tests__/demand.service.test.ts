import { describe, expect, it, vi } from "vitest";

import type { ExternalDemandRepository } from "../../repositories";
import { ExternalDemandService } from "../demand.service";

const id = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";

function repository(): ExternalDemandRepository {
  return {
    setPartnerRequest: vi.fn().mockResolvedValue({ id, status: "new", version: 1 }),
    listAdmin: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getAdminDetail: vi.fn().mockResolvedValue(null),
    searchAdminProducts: vi.fn().mockResolvedValue([]),
    transition: vi.fn().mockResolvedValue({ id, status: "reviewing", version: 2 }),
    curate: vi.fn().mockResolvedValue(id),
  };
}

describe("ExternalDemandService", () => {
  it("keeps request and cancellation explicit", async () => {
    const repo = repository(); const service = new ExternalDemandService(repo);
    await service.setPartnerRequest(id, other, "request");
    expect(repo.setPartnerRequest).toHaveBeenCalledWith(id, other, "request");
  });

  it("bounds admin aggregation without preloading", async () => {
    const repo = repository(); const service = new ExternalDemandService(repo);
    await service.listAdmin({ search: `  ${"x".repeat(130)} `, status: "new", page: 3 });
    expect(repo.listAdmin).toHaveBeenCalledWith({ search: "x".repeat(100), status: "new", limit: 25, offset: 50 });
  });

  it("rejects invalid transitions and accepts governed response input", async () => {
    const repo = repository(); const service = new ExternalDemandService(repo);
    expect(() => service.transition({ requestId: id, expectedVersion: 1, status: "cancelled" })).toThrow();
    await service.transition({ requestId: id, expectedVersion: 1, status: "solution_proposed", responseType: "catalog_product", catalogProductId: other });
    expect(repo.transition).toHaveBeenCalledWith(expect.objectContaining({ responseType: "catalog_product", catalogProductId: other }));
  });

  it("requires an auditable curation reason", async () => {
    const repo = repository(); const service = new ExternalDemandService(repo);
    expect(() => service.curate(id, other, "short")).toThrow();
  });
});
