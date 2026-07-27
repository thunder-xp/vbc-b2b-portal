import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("admin page landmark structure", () => {
  it.each([
    "app/(admin)/admin/partner-requests/page.tsx",
    "app/(admin)/admin/partner-requests/[requestId]/page.tsx",
  ])("leaves the primary main landmark to the admin shell: %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");

    expect(source).not.toMatch(/<main\b/);
  });
});
