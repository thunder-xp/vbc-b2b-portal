import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/modules/orders/repositories/supabase/order-date-change.supabase-repository.ts"), "utf8");

describe("internal date-change projection", () => {
  it("uses the canonical partner company display column", () => {
    expect(source).toContain("partner_order_date_change_requests_company_id_fkey(display_name)");
    expect(source).not.toContain("partner_order_date_change_requests_company_id_fkey(name)");
  });
});
