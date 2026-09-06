import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const copy = read("src/modules/partner-locale/saved-kit-copy.ts");
const localeCopy = read("src/modules/partner-locale/copy.ts");
const capabilities = read("src/modules/partner-cabinet/services/workspace-capability.service.ts");
const sidebar = read("src/modules/partner-cabinet/components/PartnerSidebar.tsx");
const section = read("src/modules/purchasing-lists/components/SavedKitsSection.tsx");
const saveSelection = read("src/modules/purchasing-lists/components/SaveLiveSelectionAsKitButton.tsx");
const listPage = read("app/(partner)/cabinet/purchasing-lists/page.tsx");
const legacyPages = [
  "app/(partner)/cabinet/purchase-templates/page.tsx",
  "app/(partner)/cabinet/purchase-templates/[templateId]/page.tsx",
  "app/(partner)/cabinet/purchase-templates/new/page.tsx",
].map(read).join("\n");

describe("My Kits partner UX contract", () => {
  it("uses one Russian and Romanian concept with the existing Purchasing Lists route", () => {
    expect(localeCopy).toContain('"nav.purchase_templates": "Мои комплекты"');
    expect(localeCopy).toContain('"nav.purchase_templates": "Seturile mele"');
    expect(capabilities).toContain('key: "purchase_templates", label: "Мои комплекты", href: "/cabinet/purchasing-lists", requiredPermission: "purchasing_lists.view"');
    expect(capabilities.match(/href: "\/cabinet\/purchasing-lists"/g)).toHaveLength(1);
    expect(legacyPages.match(/redirect\("\/cabinet\/purchasing-lists"\)/g)).toHaveLength(3);
  });

  it("defines the complete canonical action vocabulary", () => {
    for (const label of ["Открыть", "Сохранить комплект", "Использовать комплект", "Сохранить изменения", "Сохранить как новый", "Переименовать", "Архивировать"]) expect(copy).toContain(label);
    for (const label of ["Deschide", "Salvează setul", "Folosește setul", "Salvează modificările", "Salvează ca set nou", "Redenumește", "Arhivează"]) expect(copy).toContain(label);
    expect(copy).toContain("Вы ещё не сохранили ни одного комплекта.");
    expect(copy).not.toContain("Сохранённые подборки без зафиксированных цен и остатков.");
  });

  it("uses the shared icon vocabulary and keeps mobile actions stacked", () => {
    expect(sidebar).toContain("purchase_templates: Layers3");
    expect(section).toContain("<ArrowRight");
    expect(section).toContain("<Layers3");
    expect(section).toContain("<Save");
    expect(section).toContain("<Copy");
    expect(section).toContain("<Pencil");
    expect(section).toContain("<Archive");
    expect(saveSelection).toContain("<Save");
    expect(section).toContain("flex flex-col gap-2 sm:grid sm:grid-cols-2");
  });

  it("keeps kit cards concise and commercial truth lazy", () => {
    expect(listPage).toContain("list.itemCount");
    expect(listPage).toContain("list.totalQuantity");
    expect(listPage).toContain("list.updatedAt");
    expect(listPage).not.toContain("list.description");
    expect(listPage).not.toContain("list.warningCount");
    expect(section).toContain("getLiveCommerceKitAction(listId)");
  });
});
