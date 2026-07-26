import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726151000_admin_dashboard_aggregates.sql",
  ),
  "utf8",
);

describe("admin dashboard aggregate migration", () => {
  it("provides exactly three bounded local dashboard reads", () => {
    expect(sql).toContain("public.get_admin_platform_health_summary()");
    expect(sql).toContain("public.get_admin_operational_summary()");
    expect(sql).toContain("public.get_admin_recent_events(p_limit integer default 20)");
    expect(sql).toContain(
      "least(greatest(coalesce(p_limit, 20), 1), 20)",
    );
  });

  it("requires internal dashboard permission and performs no external call", () => {
    expect(sql.match(/admin\.dashboard\.view/g)?.length).toBe(3);
    expect(sql).not.toMatch(/\b(http|fetch)\b/i);
  });
});
