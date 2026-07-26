import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin review list query projections", () => {
  it("uses an aggregate specification item count", () => {
    const repository = source(
      "src/modules/project-specifications/repositories/supabase/project-specification.supabase-repository.ts",
    );
    const service = source(
      "src/modules/project-specifications/services/internal-specification-review.service.ts",
    );

    expect(repository).toContain("project_specification_items(count)");
    expect(service).not.toMatch(
      /listForReview[\s\S]*records\.map\(async[\s\S]*listItems/,
    );
  });

  it("uses an aggregate reservation item count", () => {
    const repository = source(
      "src/modules/reservation-requests/repositories/supabase/reservation-request.supabase-repository.ts",
    );
    const service = source(
      "src/modules/reservation-requests/services/internal-reservation-review.service.ts",
    );

    expect(repository).toContain("reservation_request_items(count)");
    expect(service).not.toMatch(
      /listForReview[\s\S]*records\.map\(async[\s\S]*listItems/,
    );
  });

  it("uses one bounded RPC for company and user history", () => {
    const repository = source(
      "src/modules/admin/repositories/supabase/admin-history.supabase-repository.ts",
    );
    const migration = source(
      "supabase/migrations/20260726165000_admin_context_history.sql",
    );
    expect(repository.match(/supabase\.rpc\(/g)).toHaveLength(1);
    expect(repository).toContain('"list_admin_context_history"');
    expect(migration).toContain(
      "least(greatest(coalesce(p_page_size, 25), 1), 50)",
    );
    expect(repository).not.toMatch(/\.map\(async|Promise\.all/);
  });
});
