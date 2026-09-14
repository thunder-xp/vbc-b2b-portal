import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914112112_enforce_partner_company_price_domain.sql"),
  "utf8",
);

describe("partner company price-domain enforcement migration", () => {
  it("accepts only explicitly governed partner price types", () => {
    expect(sql).toContain("private.classify_one_c_price_type");
    expect(sql).toContain("<> 'PARTNER_CONTRACT_PRICE'");
    expect(sql).toContain("PARTNER_PRICE_DOMAIN_VIOLATION");
  });

  it("replaces the narrower retail-only company trigger", () => {
    expect(sql).toContain("drop trigger if exists reject_final_customer_retail_partner_profile");
    expect(sql).toContain("create trigger enforce_partner_company_price_domain");
  });
});
