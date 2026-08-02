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
});
