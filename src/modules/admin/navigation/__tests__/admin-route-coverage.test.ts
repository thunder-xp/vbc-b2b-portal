import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADMIN_NAVIGATION } from "../admin-navigation";

const ROOT = process.cwd();

describe("unified admin route coverage", () => {
  it("has a page for every canonical navigation destination", () => {
    for (const item of ADMIN_NAVIGATION.flatMap((group) => group.items)) {
      const relative = item.href === "/admin"
        ? "app/(admin)/admin/page.tsx"
        : `app/(admin)${item.href}/page.tsx`;
      expect(existsSync(join(ROOT, relative)), relative).toBe(true);
    }
  });

  it("keeps compatibility routes as redirects", () => {
    const routes = [
      "app/(admin)/admin/commercial-rates/page.tsx",
      "app/(admin)/admin/integrations/catalog-sync/page.tsx",
      "app/(admin)/admin/reservation-requests/page.tsx",
      "app/(admin)/admin/access-requests/page.tsx",
    ];
    for (const route of routes) {
      expect(readFileSync(join(ROOT, route), "utf8")).toContain("redirect(");
    }
  });

  it("keeps admin pages dynamic and free of public cache directives", () => {
    for (const item of ADMIN_NAVIGATION.flatMap((group) => group.items)) {
      const relative = item.href === "/admin"
        ? "app/(admin)/admin/page.tsx"
        : `app/(admin)${item.href}/page.tsx`;
      const source = readFileSync(join(ROOT, relative), "utf8");
      expect(source).not.toMatch(/force-cache|revalidate\s*=\s*\d+/);
    }
  });
});
