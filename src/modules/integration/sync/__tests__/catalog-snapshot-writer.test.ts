import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/supabase/admin", () => ({ createAdminClient }));

import type { CatalogSnapshotDTO } from "../../dto";
import { CatalogPersistenceError } from "../catalog-persistence-error";
import { SupabaseCatalogSnapshotWriter } from "../catalog-snapshot-writer";

describe("SupabaseCatalogSnapshotWriter attribute publication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not publish or clean stale live attributes when a later staging batch fails", async () => {
    const client = clientFixture({ failStageBatch: 2 });
    createAdminClient.mockReturnValue(client.api);

    await expect(new SupabaseCatalogSnapshotWriter().writeSnapshot(snapshotFixture(201), syncId)).rejects.toBeInstanceOf(CatalogPersistenceError);
    expect(client.stageInsert).toHaveBeenCalledTimes(2);
    expect(client.publish).not.toHaveBeenCalled();
    expect(client.liveAttributeTables).toHaveLength(0);
  });

  it("publishes the complete normalized snapshot on a clean retry", async () => {
    const client = clientFixture();
    createAdminClient.mockReturnValue(client.api);

    const result = await new SupabaseCatalogSnapshotWriter().writeSnapshot(snapshotFixture(201), syncId);

    expect(client.stageInsert).toHaveBeenCalledTimes(2);
    expect(client.publish).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ attributesUpserted: 201, attributesRemoved: 3, attributeUniquePairs: 201, attributeBatchesStaged: 2, attributePublicationTransactionSucceeded: true });
  });
});

function clientFixture(options: { failStageBatch?: number } = {}) {
  let stageBatch = 0;
  const stageInsert = vi.fn(async () => {
    stageBatch += 1;
    return stageBatch === options.failStageBatch ? { error: { code: "21000", message: "failed", details: null, hint: null } } : { error: null };
  });
  const publish = vi.fn(async () => ({ data: { published: 201, removed: 3 }, error: null }));
  const liveAttributeTables: string[] = [];
  const api = {
    from: vi.fn((table: string) => {
      if (table === "catalog_product_attributes") liveAttributeTables.push(table);
      if (table === "catalog_sync_state") return { update: () => thenableChain({ error: null }) };
      if (table === "catalog_products") return { upsert: () => ({ select: async () => ({ data: [{ id: productId, external_1c_id: "product-ref" }], error: null }) }) };
      if (table === "catalog_product_attribute_sync_stage") return {
        delete: () => thenableChain({ error: null }),
        insert: stageInsert,
      };
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn((name: string) => name === "publish_catalog_product_attributes" ? publish() : Promise.resolve({ data: 0, error: null })),
  };
  return { api, stageInsert, publish, liveAttributeTables };
}

function thenableChain<T>(result: T) {
  const chain: { eq: () => typeof chain; then: Promise<T>["then"] } = {
    eq: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function snapshotFixture(attributeCount: number): CatalogSnapshotDTO {
  return {
    rootReference: { providerCode: "one-c", externalId: "root-ref", externalType: "catalog-category" },
    rootName: "Root",
    categories: [],
    products: [{
      reference: { providerCode: "one-c", externalId: "product-ref", externalType: "catalog-product" },
      categoryReference: null,
      brandReference: null,
      sku: "SKU",
      name: "Product",
      slug: null,
      shortDescription: null,
      description: null,
      imageUrl: null,
      attributes: Array.from({ length: attributeCount }, (_, index) => ({ propertyRef: `property-${index}`, key: `key-${index}`, label: `Attribute ${index}`, rawValue: `Value ${index}`, displayValue: `Value ${index}`, resolvedDisplayValue: null, resolvedValueRef: null, resolutionStatus: "not_required" as const, valueType: "string", filterable: true, visible: true, available: true })),
      isActive: true,
      isVisible: true,
      metadata: { sourceReference: { providerCode: "one-c", externalId: "product-ref", externalType: "catalog-product" }, sourceUpdatedAt: null, importedAt: null },
    }],
    pagesProcessed: 1,
    rowsReceived: 1,
  };
}

const syncId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
