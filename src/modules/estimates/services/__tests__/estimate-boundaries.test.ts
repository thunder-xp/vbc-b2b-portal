import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("estimate architecture boundaries", () => {
  it("keeps Supabase and 1C out of the service and React components", () => {
    const service = read("src/modules/estimates/services/estimate.service.ts");
    const editor = read("src/modules/estimates/components/EstimateEditor.tsx");
    expect(service).not.toContain("createClient(");
    expect(service).not.toMatch(/one[-_]?c|fetch\(/i);
    expect(editor).not.toMatch(/supabase|fetch\(|one[-_]?c/i);
  });

  it("uses a single nested aggregate repository read for editor loading", () => {
    const repository = read("src/modules/estimates/repositories/supabase/estimate.supabase-repository.ts");
    expect(repository).toContain("estimate_sections(${SECTION_COLUMNS}), estimate_items(${ITEM_COLUMNS})");
    expect(repository).not.toMatch(/for\s*\([^)]*\)\s*\{[\s\S]*?\.from\("estimate_items"\)/);
  });
});

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}
