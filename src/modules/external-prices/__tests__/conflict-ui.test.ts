import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const actions = fs.readFileSync(path.join(process.cwd(), "src/modules/external-prices/actions.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "app/(partner)/cabinet/competitor-prices/[uploadId]/page.tsx"), "utf8");

describe("external price conflict UI", () => {
  it("turns an expected apply conflict into a safe page notice", () => {
    expect(actions).toContain('error.code !== "PT409"');
    expect(actions).toContain("?notice=price_conflict");
    expect(page).toContain('query.notice==="price_conflict"');
    expect(page).toContain('role="alert"');
  });

  it("identifies conflict-review rows without changing ordinary suggestions", () => {
    expect(page).toContain('product.reason==="conflicting_price"');
    expect(page).toContain("copy.priceConflict");
  });
});
