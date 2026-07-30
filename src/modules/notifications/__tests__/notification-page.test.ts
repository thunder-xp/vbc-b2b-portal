import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const page = fs.readFileSync(
  path.join(process.cwd(), "app/(partner)/cabinet/notifications/page.tsx"),
  "utf8",
);
const repository = fs.readFileSync(
  path.join(process.cwd(), "src/modules/notifications/repositories/supabase-notification.repository.ts"),
  "utf8",
);

describe("notification page boundaries", () => {
  it("supports keyset pagination and governed filters", () => {
    expect(page).toContain("cursorAt");
    expect(page).toContain("cursorId");
    expect(page).toContain("Доступ сотрудников");
    expect(repository).toContain("p_cursor_occurred_at");
    expect(repository).toContain("p_cursor_id");
  });

  it("does not poll, call 1C, or query entities per notification", () => {
    expect(page).not.toMatch(/setInterval|setTimeout|one_c|odata/i);
    expect(repository).not.toMatch(/one_c|odata/i);
  });

  it("keeps critical notifications non-dismissible", () => {
    expect(page).toContain('item.severity !== "critical"');
  });
});

