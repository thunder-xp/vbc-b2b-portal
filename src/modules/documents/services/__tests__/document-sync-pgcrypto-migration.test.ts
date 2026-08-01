import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20260801160000_document_sync_pgcrypto_runtime_repair.sql"),
  "utf8",
);

describe("document synchronization pgcrypto runtime repair", () => {
  it("verifies the installed digest function before changing the publisher search path", () => {
    expect(sql).toContain("to_regprocedure('extensions.digest(text,text)')");
    expect(sql).toContain("perform extensions.digest(");
    expect(sql).toContain("set search_path = public, extensions");
  });

  it("does not modify document data or publication rules", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\.partner_documents\b/i);
  });
});
