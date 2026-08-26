import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826200949_enforce_commercial_currency_semantics.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

describe("commercial currency semantic migration", () => {
  it("defines one validator with separate settlement and price alignment rules", () => {
    expect(sql).toContain("validate_commercial_currency_context");
    expect(sql).toContain("SETTLEMENT_CURRENCY_MISSING");
    expect(sql).toContain("AUTHORITATIVE_PRICE_CURRENCY_MISSING");
    expect(sql).toContain("PUBLISHED_PRICE_CURRENCY_MISSING");
    expect(sql).toContain("authoritative_price_ref <> published_price_ref");
    expect(sql).not.toMatch(/settlement_ref\s*<>\s*(?:authoritative_price_ref|published_price_ref)/);
  });

  it("uses the shared validator at qualification and commercial publication boundaries", () => {
    expect(sql.match(/currency_validation := public\.validate_commercial_currency_context\(/g)).toHaveLength(2);
    expect(sql).toContain("public.qualify_partner_contract_candidate(company.id, candidate.external_1c_id)");
    expect(sql).toContain("public.qualify_partner_cash_contract_candidate");
  });

  it("publishes explicit semantic checkout fields with rolling compatibility aliases", () => {
    for (const key of [
      "settlementCurrencyRef",
      "settlementCurrencyCode",
      "authoritativePriceCurrencyRef",
      "authoritativePriceCurrencyCode",
      "publishedPriceCurrencyRef",
      "publishedPriceCurrencyCode",
    ]) expect(sql).toContain(`'${key}'`);
    expect(sql).toContain("'contractCurrencyRef'");
    expect(sql).toContain("'currencyRef'");
  });

  it("preserves privileged execution and explicit search paths", () => {
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toContain("set search_path = public");
    expect(sql).toMatch(
      /revoke all on function public\.validate_commercial_currency_context\(text, text, text\)[\s\S]*from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.get_partner_checkout_configuration\(uuid\)[\s\S]*from public, anon, authenticated/,
    );
  });

  it("does not change commercial data, pricing, access, or membership tables", () => {
    expect(sql).not.toMatch(/\b(?:create|alter|drop)\s+table\b/i);
    expect(sql).not.toMatch(/\bdo\s+\$\$/i);
    expect(sql).not.toMatch(/\bselect\s+public\.(?:publish|begin|map)_/i);
    expect(sql).not.toContain("exchange_rate");
  });
});
