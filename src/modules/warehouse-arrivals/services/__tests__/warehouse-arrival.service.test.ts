import { describe, expect, it, vi } from "vitest";
import { WarehouseArrivalService } from "../warehouse-arrival.service";

const userId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const arrivalId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";

describe("WarehouseArrivalService", () => {
  it("enriches mapped products with one batched catalog and commercial read", async () => {
    const repository = fixtureRepository();
    repository.get.mockResolvedValue({ id: arrivalId, completedAt: "2026-08-20T12:00:00Z", productCount: 1, seen: false, productIds: [productId] });
    const catalog = { getProductsByIds: vi.fn(async () => [{ id: productId, sku: "100", name: "Camera", slug: "camera", shortDescription: null, imageUrl: null, brand: null, category: null, keyCharacteristics: [], datasheet: null }]) };
    const pricing = { getProductCommercialViews: vi.fn(async () => [{ productId, partnerPrice: null, retailPrice: null, stock: null, isDemoData: false, retailBelowPartnerPrice: false }]) };
    const workspaceContext = workspace();
    const result = await new WarehouseArrivalService(repository, workspaceContext.service, catalog as never, pricing as never).get(userId, arrivalId);
    expect(result?.products).toHaveLength(1);
    expect(catalog.getProductsByIds).toHaveBeenCalledOnce();
    expect(pricing.getProductCommercialViews).toHaveBeenCalledOnce();
    expect(catalog.getProductsByIds).toHaveBeenCalledWith(userId, [productId]);
    expect(workspaceContext.getWorkspaceContext).toHaveBeenCalledOnce();
  });

  it("keeps page reads company-scoped and bounded", async () => {
    const repository = fixtureRepository();
    repository.list.mockResolvedValue({ items: [], totalCount: 0 });
    const service = new WarehouseArrivalService(repository, workspace().service, {} as never, {} as never);
    await service.list(userId, { page: 2, pageSize: 500, unseenOnly: true });
    expect(repository.list).toHaveBeenCalledWith(companyId, expect.objectContaining({ offset: 50, pageSize: 50, unseenOnly: true }));
  });
});

function workspace() { const getWorkspaceContext = vi.fn(async () => ({ accessState: "active", companyId, userId, capabilities: { productCard: {} } })); return { getWorkspaceContext, service: { getWorkspaceContext } as never }; }
function fixtureRepository() { return { list: vi.fn(), get: vi.fn(), markSeen: vi.fn() }; }
