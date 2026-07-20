import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260720040000_saved_purchasing_lists.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/modules/estimates/services/estimate.service.ts"), "utf8");

describe("purchasing list estimate conversion contract", () => {
  it("uses one atomic bounded estimate RPC without creating orders or proposals", () => {
    const start = migration.indexOf("create or replace function public.create_estimate_from_purchasing_list");
    const block = migration.slice(start, migration.indexOf("commit;", start));
    expect(block.match(/insert into public\.estimates/g)).toHaveLength(1);
    expect(block.match(/insert into public\.estimate_items/g)).toHaveLength(1);
    expect(block).toContain("jsonb_array_length(target_items) not between 1 and 50");
    expect(block).not.toMatch(/partner_orders|commercial_proposals/);
  });

  it("bulk-loads current catalog and commercial data before the RPC", () => {
    const start = service.indexOf("async createFromPurchasingList");
    const block = service.slice(start, service.indexOf("async ", start + 10));
    expect(block.match(/getProductsByIds/g)).toHaveLength(1);
    expect(block.match(/getProductCommercialViews/g)).toHaveLength(1);
    expect(block).toContain("repository.createFromPurchasingList");
  });
});
