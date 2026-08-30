import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260830122725_preserve_hidden_order_history_merge_identity.sql",
  ),
  "utf8",
);

describe("order-history merge identity migration", () => {
  it("matches by canonical refs and linked portal ids without using order number", () => {
    expect(sql).toContain("history.external_1c_order_ref = any");
    expect(sql).toContain("history.portal_order_id = any");
    expect(sql).not.toContain("external_1c_order_number");
    expect(sql).not.toContain("history.partner_visible");
  });

  it("keeps hidden identity inspection server-only", () => {
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("set search_path = public");
  });
});
