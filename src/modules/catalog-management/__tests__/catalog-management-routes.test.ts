import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unified catalog management routes", () => {
  it("keeps one canonical navigation item and redirects legacy workspaces", () => {
    const navigation = readFileSync("src/modules/admin/navigation/admin-navigation.ts", "utf8");
    const catalogLegacy = readFileSync("app/(admin)/admin/commercial/catalog/page.tsx", "utf8");
    const showcaseLegacy = readFileSync("app/(admin)/admin/commercial/merchandising/page.tsx", "utf8");
    expect(navigation).toContain('{ label: "Управление каталогом", href: "/admin/catalog"');
    expect(navigation).not.toContain('{ label: "Витрина каталога"');
    expect(catalogLegacy).toContain('redirect(params.size ? `/admin/catalog?${params}` : "/admin/catalog")');
    expect(showcaseLegacy).toContain('redirect(params.size ? `/admin/catalog?${params}` : "/admin/catalog")');
  });

  it("keeps Firebase server-side and never uses Supabase Storage for original uploads", () => {
    const route = readFileSync("app/api/admin/catalog/products/[productId]/image/route.ts", "utf8");
    const storage = readFileSync("src/modules/catalog-management/firebase-product-image-storage.ts", "utf8");
    expect(route).toContain('requireAdminPermission("admin.catalog.manage")');
    expect(route).not.toContain("NEXT_PUBLIC_FIREBASE");
    expect(storage).toContain("novotech-systems-5449b.appspot.com");
    expect(storage).not.toContain("supabase.storage");
    expect(storage).not.toContain('.storage.from(');
  });

  it("uses one catalog projection RPC and no per-row status reads", () => {
    const page = readFileSync("app/(admin)/admin/catalog/page.tsx", "utf8");
    const repository = readFileSync("src/modules/catalog-management/repository.ts", "utf8");
    expect(page.match(/service\.list\(/g)).toHaveLength(1);
    expect(repository).toContain('.rpc("get_admin_catalog_management_page_v1"');
    expect(repository.match(/get_admin_catalog_management_page_v1/g)).toHaveLength(1);
  });
});
