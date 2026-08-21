import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260821234008_repair_checkout_directory_publication_role_guard.sql",
  ),
  "utf8",
);

describe("counterparty directory publication role guard", () => {
  it("uses the canonical PostgREST role projection and preserves service-only execution", () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).not.toContain("request.jwt.claim.role");
    expect(migration).toContain(
      "revoke all on function public.publish_one_c_counterparty_directory(uuid)",
    );
    expect(migration).toContain("to service_role;");
  });
});
