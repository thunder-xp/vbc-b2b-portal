import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/(partner)/cabinet/installation-marketplace/page.tsx"), "utf8");

describe("Installation operational tabs", () => {
  it("keeps exactly the four operational views and renders profile separately", () => {
    expect(source).toContain('const operationalViews = ["overview", "new", "active", "completed"] as const');
    expect(source).toContain('{view !== "profile" ? <PartnerWorkspaceTabs');
    expect(source).toContain('{view === "profile" ?');
    expect(source).toContain('new: "Новые"');
    expect(source).toContain('active: "Активные"');
    expect(source).toContain('new: "Noi"');
    expect(source).toContain('active: "Active"');
  });
});
