import { describe, expect, it, vi } from "vitest";
import type { CatalogSnapshotWriter, CatalogSyncState } from "../catalog-snapshot-writer";
import { DailyCatalogSyncService } from "../daily-catalog-sync.service";

describe("DailyCatalogSyncService", () => {
  it("transitions through running work to persisted succeeded state", async () => {
    const writer = writerFixture();
    const provider = { fetchFullSnapshot: vi.fn(async () => snapshot) };
    const result = await new DailyCatalogSyncService(provider, writer).runFullSync();
    expect(writer.acquireLock).toHaveBeenCalledOnce();
    expect(provider.fetchFullSnapshot).toHaveBeenCalledOnce();
    expect(writer.writeSnapshot).toHaveBeenCalledOnce();
    expect(writer.markSucceeded).toHaveBeenCalledOnce();
    expect(result.state.status).toBe("succeeded");
  });

  it("persists failed root_discovery when root lookup fails", async () => {
    const writer = writerFixture({ state: { ...succeededState, status: "failed", errorCategory: "IntegrationValidationError", failedStage: "root_discovery" } });
    const provider = { fetchFullSnapshot: vi.fn(async () => { throw Object.assign(new Error("missing"), { name: "IntegrationValidationError" }); }) };
    const result = await new DailyCatalogSyncService(provider, writer).runFullSync();
    expect(writer.writeSnapshot).not.toHaveBeenCalled();
    expect(writer.markFailed).toHaveBeenCalledWith(expect.any(String), "IntegrationValidationError", "root_discovery", expect.any(String), expect.any(String));
    expect(result.state.failedStage).toBe("root_discovery");
  });

  it("fails an empty subtree before persistence", async () => {
    const writer = writerFixture({ state: { ...succeededState, status: "failed", errorCategory: "empty_subtree", failedStage: "subtree_resolution" } });
    const provider = { fetchFullSnapshot: vi.fn(async () => ({ ...snapshot, products: [] })) };
    await new DailyCatalogSyncService(provider, writer).runFullSync();
    expect(writer.writeSnapshot).not.toHaveBeenCalled();
    expect(writer.markSucceeded).not.toHaveBeenCalled();
    expect(writer.markFailed).toHaveBeenCalledWith(expect.any(String), "empty_subtree", "subtree_resolution", expect.any(String), expect.any(String));
  });

  it("does not persist or deactivate after duplicate page rows", async () => {
    const writer = writerFixture({ state: { ...succeededState, status: "failed", errorCategory: "duplicate_page_rows", failedStage: "nomenclature_scan" } });
    const failure = Object.assign(new Error("duplicate"), { errorCategory: "duplicate_page_rows", failedStage: "nomenclature_scan" });
    const provider = { fetchFullSnapshot: vi.fn(async () => { throw failure; }) };
    await new DailyCatalogSyncService(provider, writer).runFullSync();
    expect(writer.writeSnapshot).not.toHaveBeenCalled();
    expect(writer.markSucceeded).not.toHaveBeenCalled();
    expect(writer.markFailed).toHaveBeenCalledWith(expect.any(String), "duplicate_page_rows", "nomenclature_scan", expect.any(String), expect.any(String));
  });
});

const snapshot = { rootReference: { providerCode: "one-c", externalId: "root", externalType: "catalog-category" }, rootName: "SECURITYPARK DISTRIBUTION", categories: [], products: [{ reference: { providerCode: "one-c", externalId: "product", externalType: "catalog-product" }, categoryReference: null, brandReference: null, sku: "SKU", name: "Product", slug: null, shortDescription: null, description: null, imageUrl: null, isActive: true, isVisible: true, metadata: { sourceReference: { providerCode: "one-c", externalId: "product", externalType: "catalog-product" }, sourceUpdatedAt: null, importedAt: null } }], pagesProcessed: 1, rowsReceived: 1 };
const succeededState: CatalogSyncState = { status: "succeeded", rootName: "SECURITYPARK DISTRIBUTION", lastSuccessfulSyncAt: "2026-07-12T02:00:00.000Z", durationMs: 10, pagesProcessed: 1, foldersReceived: 0, productsReceived: 0, foldersUpserted: 0, productsUpserted: 0, rowsDeactivated: 0, errorCategory: null, failedStage: null, nextScheduledRun: "2026-07-13T02:00:00.000Z" };
function writerFixture(options: { state?: CatalogSyncState } = {}) {
  return { acquireLock: vi.fn(async () => true), writeSnapshot: vi.fn(async () => ({ foldersUpserted: 0, productsUpserted: 0, rowsDeactivated: 0 })), markSucceeded: vi.fn(async () => undefined), markFailed: vi.fn(async () => undefined), getState: vi.fn(async () => options.state ?? succeededState) } satisfies CatalogSnapshotWriter;
}
