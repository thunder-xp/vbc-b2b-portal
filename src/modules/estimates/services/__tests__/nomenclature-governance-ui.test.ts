import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getEstimatesCopy } from "@/src/modules/partner-locale";

const read = (path: string) => readFileSync(resolve(path), "utf8");
describe("nomenclature governance UI boundaries", () => {
  it("uses one canonical admin route and capability", () => {
    const nav = read("src/modules/admin/navigation/admin-navigation.ts");
    const page = read("app/(admin)/admin/commercial/nomenclature/page.tsx");
    expect(nav).toContain('href: "/admin/commercial/nomenclature"');
    expect(nav).toContain('permission: "admin.external_nomenclature.view"');
    expect(page).toContain('requireAdminPagePermission("admin.external_nomenclature.view")');
  });
  it("keeps partner upload compact and hides it for services/canonical covers", () => {
    const workspace = read("src/modules/estimates/components/PartnerNomenclatureWorkspace.tsx");
    expect(workspace).toContain('effectiveType !== "service"');
    expect(workspace).toContain('item.coverScope === "canonical"');
    expect(workspace).toContain("copy.coverRequirements");
    expect(getEstimatesCopy("ru").coverRequirements).toBe("JPG, PNG или WebP, до 2 МБ.");
    expect(getEstimatesCopy("ro").coverRequirements).toBe("JPG, PNG sau WebP, până la 2 MB.");
    expect(workspace).not.toContain("drag");
  });
  it("uses an authenticated proxy rather than public or signed URLs", () => {
    const route = read("app/api/nomenclature/covers/[itemId]/route.ts");
    expect(route).toContain('rpc("resolve_external_nomenclature_cover"');
    expect(route).toContain('from("partner-nomenclature-covers").download');
    expect(route).not.toContain("createSignedUrl"); expect(route).not.toContain("getPublicUrl");
  });
});
