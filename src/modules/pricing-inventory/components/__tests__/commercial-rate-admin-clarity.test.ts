import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/modules/pricing-inventory/components/CommercialRateAdminPanel.tsx"), "utf8");
const action = readFileSync(resolve(process.cwd(), "src/modules/pricing-inventory/actions/commercial-rate.actions.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901175950_commercial_rate_manual_verification.sql"), "utf8");

describe("automatic commercial-rate administration", () => {
  it("identifies 1C as the automatic source and exposes durable freshness", () => {
    expect(panel).toContain("Источник: 1С — автоматически");
    expect(panel).toContain("каждые 5 минут");
    expect(panel).toContain("Последняя проверка источника");
    expect(panel).toContain("Последняя публикация");
    for (const label of ["Не проверено", "Соответствует 1С", "Не соответствует 1С", "Проверено вручную, изменений не требуется"]) expect(panel).toContain(label);
  });

  it("keeps the single manual control behind an emergency-only disclosure", () => {
    for (const label of ["Курс 1С", "Портал", "Код", "Источник", "Дата курса", "Состояние", "Аварийная ручная публикация"]) expect(panel).toContain(label);
    expect(panel).toContain("Применить значение 1С");
    expect(panel).toContain("Перепроверить данные");
    expect(panel).not.toContain("Проверить и сохранить контроль");
    expect(panel).not.toContain("Опубликовать значение из 1С");
    expect(panel.match(/type="submit"/g)).toHaveLength(1);
    expect(panel).toContain('name="intent" type="hidden" value="publish"');
    expect(panel).toContain('rate.sourceType === "one_c_automatic" ? "1С — автоматически"');
  });

  it("keeps verification and publication histories separate", () => {
    expect(panel).toContain("История проверок по 1С");
    expect(panel).toContain("История публикаций в портал");
    expect(migration).toContain("prevent_commercial_rate_verification_mutation");
  });

  it("avoids revalidation for semantic no-ops", () => {
    expect(action).toContain('result.verificationOutcome !== "unchanged"');
    expect(action).toContain('result.publicationOutcome === "published"');
    expect(action).toContain("Новая версия не создана");
    expect(action).toContain('revalidatePath("/admin/commercial/rates")');
  });
});
