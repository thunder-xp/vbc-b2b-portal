import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("quick reorder baseline architecture", () => {
  it("keeps the order list on summary data without line-item reads", () => {
    const page = source("app/(partner)/cabinet/orders/page.tsx");
    const service = source("src/modules/orders/services/order-history.service.ts");

    expect(page).toContain("listPartnerOrderHistoryAction");
    expect(page).not.toContain("getPartnerOrderHistoryAction");
    expect(service.match(/async list\(userId[\s\S]*?async listPlannedShipments/)?.[0]).not.toContain("listItemsByOrderIds");
  });

  it("loads order-detail lines in one bounded repository call", () => {
    const service = source("src/modules/orders/services/order-history.service.ts");
    const detail = service.match(/async get\(userId[\s\S]*?async syncOwnCompany/)?.[0] ?? "";

    expect(detail).toContain("listItemsByOrderIds([order.id])");
    expect(detail.match(/listItemsByOrderIds/g)).toHaveLength(1);
  });

  it("has a proven idempotent single-RPC cart merge pattern", () => {
    const service = source("src/modules/orders/services/cart.service.ts");
    const repository = source("src/modules/orders/repositories/supabase/order.supabase-repository.ts");
    const migration = source("supabase/migrations/20260716190000_estimate_versions_workflow.sql");

    expect(service).toContain("getProductCommercialViews(userId, ids)");
    expect(repository).toContain('rpc("merge_estimate_products_into_cart"');
    expect(migration).toContain("where company_id = target_company_id and request_key = target_request_key");
    expect(migration).toContain("on conflict (cart_id, product_id) do update");
  });

  it("confirms repeat order is not implemented through a competing path", () => {
    const workspace = source("src/modules/partner-cabinet/services/workspace-home.service.ts");
    const cartActions = source("src/modules/orders/actions/cart.actions.ts");

    expect(workspace).toContain('action("repeat_order", "Повторить заказ", "orders")');
    expect(cartActions).not.toMatch(/repeat|reorder/i);
  });
});
