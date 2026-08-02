import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const component = fs.readFileSync(
  path.resolve("src/modules/admin/components/AdminPartnerIntegrityDetail.tsx"),
  "utf8",
);
const route = fs.readFileSync(
  path.resolve("app/(admin)/admin/partners/users/[profileId]/page.tsx"),
  "utf8",
);

describe("admin partner integrity UI", () => {
  it("uses the canonical route and explicit internal permission", () => {
    expect(route).toContain('requireAdminPagePermission("admin.users.view")');
    expect(route).toContain("admin.partner_integrity.manage");
  });

  it("renders identity, active memberships, membership history, requests, and audit", () => {
    expect(component).toContain("Идентичность");
    expect(component).toContain("Активные членства");
    expect(component).toContain("История членств");
    expect(component).toContain("Предыдущий статус");
    expect(component).toContain("Дата активации");
    expect(component).toContain("Дата отзыва/изменения");
    expect(component).toContain("Связанные заявки и диагностика");
    expect(component).toContain("Аудит исправлений");
    expect(component).toContain('value="move"');
    expect(component).toContain('value="add"');
  });

  it("requires a reason and submits only through server actions", () => {
    expect(component).toContain("minLength={20}");
    expect(component).toContain("repairApprovedOnboardingAction");
    expect(component).toContain("moveOrAddPartnerMembershipAction");
  });
});
