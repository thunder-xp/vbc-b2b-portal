import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260802150000_partner_momentum_admin_acceptance_repair.sql"),
  "utf8",
);
const deduplicationMigration = fs.readFileSync(
  path.resolve("supabase/migrations/20260802151000_partner_momentum_admin_deduplicate_counterparty.sql"),
  "utf8",
);
const page = fs.readFileSync(
  path.resolve("app/(admin)/admin/commercial/partner-momentum/page.tsx"),
  "utf8",
);

describe("partner momentum admin acceptance repair", () => {
  it("joins the current 1C directory schema", () => {
    expect(migration).toContain("counterparty.external_1c_id");
    expect(migration).not.toContain("counterparty.reference");
  });

  it("preserves assigned-manager and global permission boundaries", () => {
    expect(deduplicationMigration).toContain("partner_momentum.view_all");
    expect(deduplicationMigration).toContain("partner_momentum.view_assigned");
    expect(deduplicationMigration).toContain("can_all or company.assigned_internal_manager_user_id = actor");
  });

  it("returns one admin row per company when the 1C directory retains history", () => {
    expect(deduplicationMigration).toContain("left join lateral");
    expect(deduplicationMigration).toContain("directory.external_1c_id");
    expect(deduplicationMigration).toContain("directory.synchronized_at desc");
    expect(deduplicationMigration).toContain("limit 1");
  });

  it("renders the existing aggregate diagnostics without another query", () => {
    expect(page).toContain("Открыть диагностику");
    expect(page).toContain("Обычный интервал заказов");
    expect(page).toContain("Текущий цикл");
    expect(page).toContain("Рекомендуемые действия");
    expect(page).toContain("item.normalOrderIntervalDays");
    expect(page).toContain("item.cycleOverrunRatio");
  });

  it("shows the complete production status summary", () => {
    for (const label of [
      "Рост",
      "Стабильно",
      "Снижение активности",
      "Требует внимания",
      "Высокий риск",
      "Восстановились",
      "Недостаточно истории",
    ]) {
      expect(page).toContain(label);
    }
  });
});
