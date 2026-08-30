import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve("src/modules/orders/repositories/supabase/order-history.supabase-repository.ts"),
  "utf8",
);

describe("order history portal identity resolution", () => {
  it("resolves a synchronized order by history or linked portal order id", () => {
    expect(source).toContain(
      ".or(`id.eq.${orderId},portal_order_id.eq.${orderId}`)",
    );
    expect(source).toContain('.eq("partner_visible", true).maybeSingle()');
  });

  it("uses a server-only merge identity RPC plus the bounded partner page RPC", () => {
    expect(source).toContain('createAdminClient().rpc("get_partner_order_history_merge_identity_matches"');
    expect(source).toContain("p_external_refs: candidates.external1cRefs");
    expect(source).toContain('.rpc("get_partner_order_history_page"');
    expect(source).not.toContain('.select("external_1c_order_ref, portal_order_id")');
  });
});
