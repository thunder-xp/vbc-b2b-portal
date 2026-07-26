import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin identity routes", () => {
  it("keeps company users as a compatibility redirect", () => {
    const page = source("app/(admin)/admin/company-users/page.tsx");
    expect(page).toContain("/admin/companies/");
    expect(page).toContain("?tab=users");
    expect(page).not.toContain("CompanyUsersPanel");
  });

  it("reuses the canonical company-user module in company detail", () => {
    const page = source("app/(admin)/admin/companies/[companyId]/page.tsx");
    expect(page).toContain("getCompanyUsersAction");
    expect(page).toContain("CompanyUsersPanel");
  });

  it("does not expose invitation tokens in the invitation directory", () => {
    const page = source(
      "src/modules/admin/components/AdminInvitationDirectory.tsx",
    );
    expect(page).not.toMatch(/tokenHash|token_hash|plaintextToken/);
    expect(page).toContain("InvitationActions");
  });
});
