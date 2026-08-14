import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("app/(admin)/admin/partners/public-directory/page.tsx"), "utf8");
const action = readFileSync(resolve("src/modules/admin/actions/admin-public-partner-directory.actions.ts"), "utf8");

describe("admin public partner-directory route", () => {
  it("requires the canonical internal publication permission", () => {
    expect(page).toContain('requireAdminPagePermission("admin.catalog.manage")');
    expect(action).toContain('requireAdminPermission("admin.catalog.manage")');
  });

  it("invalidates only the governance and public directory routes", () => {
    expect(action).toContain('revalidatePath("/admin/partners/public-directory")');
    expect(action).toContain('revalidatePath("/partners")');
    expect(action).not.toMatch(/revalidatePath\("\/"\)/);
  });
});
