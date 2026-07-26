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
});
