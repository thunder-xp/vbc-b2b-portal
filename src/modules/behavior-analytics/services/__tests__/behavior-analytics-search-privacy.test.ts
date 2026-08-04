import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260804100000_behavior_analytics_search_privacy.sql",
  "utf8",
).replace(/\r\n/g, "\n");

describe("behavior analytics search privacy", () => {
  it("redacts search text at the database boundary", () => {
    expect(migration).toContain("new.search_query_normalized := null");
    expect(migration).toContain("before insert or update of search_query_normalized");
  });

  it("does not expose the trigger helper to request roles", () => {
    expect(migration).toMatch(
      /revoke all on function public\.redact_partner_behavior_search_text\(\)[\s\S]*from public, anon, authenticated/,
    );
  });
});
