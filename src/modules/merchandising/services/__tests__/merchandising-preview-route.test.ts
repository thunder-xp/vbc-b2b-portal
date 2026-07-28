import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(
  process.cwd(),
  "app/(admin)/admin/commercial/merchandising/preview/page.tsx",
), "utf8");

describe("admin merchandising preview route", () => {
  it("uses the admin permission guard and never enters partner context", () => {
    expect(source).toContain('requireAdminPagePermission("admin.catalog.view")');
    expect(source).toContain("getAdminPreview(8)");
    expect(source).not.toContain("getActiveCompanyContext");
    expect(source).not.toContain("companyId");
    expect(source).not.toContain("BehaviorViewEvent");
  });
});
