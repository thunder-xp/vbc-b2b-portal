import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260826194332_align_order_submission_contract_currency_semantics.sql",
  ),
  "utf8",
);
const validatorSql = sql.slice(
  sql.indexOf("create or replace function public.validate_partner_order_submission_v4"),
  sql.indexOf("revoke all on function public.validate_partner_order_submission_v4"),
);

describe("order pre-submission validation migration", () => {
  it("shares one validator between dry-run diagnostics and the mutation boundary", () => {
    expect(sql).toContain("create or replace function public.validate_partner_order_submission_v4");
    expect(sql).toContain("validation := public.validate_partner_order_submission_v4(");
    expect(
      sql.match(/create or replace function public\.validate_partner_order_submission_v4\(/g),
    ).toHaveLength(1);
  });

  it("keeps the dry-run validator free from persistent writes", () => {
    expect(validatorSql).not.toMatch(/\binsert\s+into\b/i);
    expect(validatorSql).not.toMatch(/\bupdate\s+public\./i);
    expect(validatorSql).not.toMatch(/\bdelete\s+from\b/i);
    expect(validatorSql).not.toContain("exportSalesOrder");
  });

  it("uses governed price currency without equating it to settlement currency", () => {
    expect(validatorSql).toContain("qualification->>'publishedPriceCurrencyRef'");
    expect(validatorSql).toContain("public.qualify_partner_cash_contract_candidate");
    expect(validatorSql).not.toContain("contract_currency_external_1c_id");
  });

  it("returns stable typed preparation failures and keeps authorization server-side", () => {
    for (const code of [
      "ORDER_CART_VERSION_CONFLICT",
      "ORDER_PAYMENT_CONFIGURATION_INVALID",
      "ORDER_FULFILLMENT_CONFIGURATION_INVALID",
      "ORDER_CONTRACT_INVALID",
      "ORDER_PAYLOAD_VALIDATION_FAILED",
    ]) {
      expect(validatorSql).toContain(`'${code}'`);
    }
    expect(validatorSql).toContain("created_by = auth.uid()");
    expect(validatorSql).toContain("public.can_manage_partner_order_company");
  });

  it("preserves one governed order insert and existing idempotency", () => {
    expect(sql.match(/insert into public\.partner_orders/g)).toHaveLength(1);
    expect(sql).toContain("where submission_key = target_submission_key");
    expect(sql).toContain("ORDER_SUBMISSION_FINGERPRINT_CONFLICT");
  });

  it("does not expose the security-definer validator to anonymous callers", () => {
    expect(sql).toContain(
      "revoke all on function public.validate_partner_order_submission_v4",
    );
    expect(sql).toContain(") from public, anon;");
    expect(sql).toContain(") to authenticated;");
  });
});
