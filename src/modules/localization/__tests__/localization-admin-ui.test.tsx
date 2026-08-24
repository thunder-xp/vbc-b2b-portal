import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const component = fs.readFileSync(path.join(process.cwd(), "src/modules/localization/LocalizationWorkbench.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "app/(admin)/admin/content/localization/page.tsx"), "utf8");
const transfer = fs.readFileSync(path.join(process.cwd(), "src/modules/localization/LocalizationBulkTransfer.tsx"), "utf8");

describe("localization admin workbench", () => {
  it("shows source and Romanian content with governed review actions", () => {
    expect(component).toContain("Источник · RU");
    expect(component).toContain("Локализация · RO");
    expect(component).toContain("Сохранить черновик");
    expect(component).toContain("Проверено");
    expect(component).not.toContain("Перевести заново");
    expect(component).not.toContain("Вернуть машинный черновик");
    expect(component).toContain("Источник изменился");
    expect(component).toContain("Краткое описание");
  });

  it("uses the existing catalog permissions and exposes status filters", () => {
    expect(page).toContain('requireAdminPagePermission("admin.catalog.view")');
    expect(page).toContain('context.permissions.includes("admin.catalog.manage")');
    for (const status of ["missing", "draft", "outdated", "reviewed"]) expect(page).toContain(`value="${status}"`);
  });

  it("provides bounded export and dry-run import before mutation", () => {
    expect(transfer).toContain("Пакетная локализация");
    expect(transfer).toContain("Проверить файл");
    expect(transfer).toContain("importLocalizationAction");
    expect(transfer).toContain("previewLocalizationImportAction");
    expect(transfer).toContain("file.size > 512_000");
    expect(transfer).toContain('status: entityType === "product" ? "missing" : undefined');
    expect(transfer).toContain("100 приоритетных товаров");
  });
});
