import { describe, expect, it } from "vitest";
import type { CompanyAccessService } from "../../../access-control/services";
import { MembershipStatus } from "../../../access-control/types";
import type { CatalogFavoriteRepository } from "../../repositories";
import type { CatalogService } from "../catalog.service";
import { DefaultCatalogFavoriteService } from "../catalog-favorite.service";

describe("DefaultCatalogFavoriteService", () => {
  it("deduplicates favorites and removes the owned favorite", async () => {
    const repository = new FakeFavoriteRepository();
    const service = new DefaultCatalogFavoriteService(repository, accessService(), catalogService());
    await expect(service.toggle("user-1", "product-1")).resolves.toBe(true);
    expect(repository.rows.size).toBe(1);
    await repository.add("user-1", "company-1", "product-1");
    expect(repository.rows.size).toBe(1);
    await expect(service.toggle("user-1", "product-1")).resolves.toBe(false);
    expect(repository.rows.size).toBe(0);
  });
});

class FakeFavoriteRepository implements CatalogFavoriteRepository {
  rows = new Set<string>();
  exists(userId: string, companyId: string, productId: string) { return Promise.resolve(this.rows.has(`${userId}:${companyId}:${productId}`)); }
  add(userId: string, companyId: string, productId: string) { this.rows.add(`${userId}:${companyId}:${productId}`); return Promise.resolve(); }
  remove(userId: string, companyId: string, productId: string) { this.rows.delete(`${userId}:${companyId}:${productId}`); return Promise.resolve(); }
}

function accessService(): CompanyAccessService { return { getOwnMemberships: async () => [{ id: "membership-1", userId: "user-1", companyId: "company-1", roleId: "role-1", status: MembershipStatus.Active, approvedBy: null, approvedAt: null, revokedBy: null, revokedAt: null, createdAt: "", updatedAt: "" }], getActiveCompanyContext: async () => ({ membership: {} as never, company: { id: "company-1" } as never }), validateCompanyAccess: async () => ({ isAllowed: true, context: null }) } as unknown as CompanyAccessService; }
function catalogService(): CatalogService { return { getProductsByIds: async () => [{ id: "product-1" } as never] } as unknown as CatalogService; }
