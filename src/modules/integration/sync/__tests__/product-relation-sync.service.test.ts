import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/src/lib/supabase/admin";
import { ProductRelationSyncService } from "../product-relation-sync.service";

describe("ProductRelationSyncService", () => {
  let database: ReturnType<typeof databaseFixture>;

  beforeEach(() => {
    database = databaseFixture();
    vi.mocked(createAdminClient).mockReturnValue(database.client as never);
  });

  it("stages one deduplicated snapshot and publishes it atomically", async () => {
    const service = new ProductRelationSyncService({ loadSnapshot: vi.fn(async () => snapshot()) } as never);

    const result = await service.synchronize();

    expect(result).toMatchObject({ published: 2, staged: 2, sourceProductsWithAnalogs: 1, sourceProductsWithRelated: 1 });
    expect(database.rpc).toHaveBeenCalledOnce();
    expect(database.inserts.some((value) => value.table === "product_relation_sync_stage")).toBe(true);
  });

  it("never invokes publication when provider loading fails", async () => {
    const service = new ProductRelationSyncService({ loadSnapshot: vi.fn(async () => { throw new Error("provider unavailable"); }) } as never);

    await expect(service.synchronize()).rejects.toThrow("provider unavailable");

    expect(database.rpc).not.toHaveBeenCalled();
    expect(database.updates).toContainEqual(expect.objectContaining({
      table: "product_relation_sync_runs",
      payload: expect.objectContaining({ status: "failed" }),
    }));
    expect(database.updates).toContainEqual(expect.objectContaining({
      payload: expect.objectContaining({ safe_error_code: "provider_load_Error" }),
    }));
  });
});

function databaseFixture() {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const chain = () => {
    const value: Record<string, unknown> = {};
    for (const method of ["eq", "lt", "limit", "select"]) value[method] = vi.fn(() => value);
    value.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    value.then = (resolve: (result: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
    return value;
  };
  const rpc = vi.fn(async () => ({
    data: { published: 2, sourceProductsWithAnalogs: 1, sourceProductsWithRelated: 1 },
    error: null,
  }));
  return {
    inserts,
    updates,
    rpc,
    client: {
      from: (table: string) => ({
        update: (payload: Record<string, unknown>) => { updates.push({ table, payload }); return chain(); },
        insert: (payload: unknown) => { inserts.push({ table, payload }); return chain(); },
        select: () => chain(),
      }),
      rpc,
    },
  };
}

function snapshot() {
  return {
    rows: [
      { relationType: "analog" as const, sourceProductRef: "11111111-1111-1111-1111-111111111111", targetProductRef: "22222222-2222-2222-2222-222222222222", sourceCharacteristicRef: null, targetCharacteristicRef: null, priority: 0, sourceOrdinal: 0 },
      { relationType: "related" as const, sourceProductRef: "11111111-1111-1111-1111-111111111111", targetProductRef: "33333333-3333-3333-3333-333333333333", sourceCharacteristicRef: null, targetCharacteristicRef: null, priority: 0, sourceOrdinal: 1 },
    ],
    rejections: [], analogRowsReceived: 1, relatedRowsReceived: 1,
    pagesProcessed: 2, duplicatesCollapsed: 0,
  };
}
