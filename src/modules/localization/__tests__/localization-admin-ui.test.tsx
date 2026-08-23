import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const component = fs.readFileSync(path.join(process.cwd(), "src/modules/localization/LocalizationWorkbench.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "app/(admin)/admin/content/localization/page.tsx"), "utf8");

describe("localization admin workbench", () => {
  it("shows source and Romanian content with governed review actions", () => {
    expect(component).toContain("Источник · RU");
    expect(component).toContain("Локализация · RO");
    expect(component).toContain("Сохранить черновик");
    expect(component).toContain("Проверено");
    expect(component).toContain("Перевести заново");
    expect(component).toContain("Вернуть машинный черновик");
    expect(component).toContain("Источник изменился");
  });

  it("uses the existing catalog permissions and exposes status filters", () => {
    expect(page).toContain('requireAdminPagePermission("admin.catalog.view")');
    expect(page).toContain('context.permissions.includes("admin.catalog.manage")');
    for (const status of ["missing", "machine_draft", "outdated", "reviewed"]) expect(page).toContain(`value="${status}"`);
  });
});
