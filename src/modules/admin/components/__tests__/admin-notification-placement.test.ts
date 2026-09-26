import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "app/(admin)/admin/page.tsx"),
  "utf8",
);
const layout = readFileSync(
  resolve(process.cwd(), "app/(admin)/admin/layout.tsx"),
  "utf8",
);

describe("Admin notification placement", () => {
  it("loads the live projection once in the Admin shell and removes the dashboard feed", () => {
    expect(layout).toContain("createAdminActionCenterService");
    expect(layout).toContain("notificationCenter={notificationCenter}");
    expect(page).not.toContain("AdminActionCenterView");
    expect(page).not.toContain("createAdminActionCenterService");
    expect(page).not.toContain("Требует внимания");
  });
});
