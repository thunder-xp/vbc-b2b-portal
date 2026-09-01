import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/modules/pricing-inventory/components/CommercialRateAdminPanel.tsx"), "utf8");
const action = readFileSync(resolve(process.cwd(), "src/modules/pricing-inventory/actions/commercial-rate.actions.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901175950_commercial_rate_manual_verification.sql"), "utf8");

describe("commercial-rate manual verification", () => {
  it("uses truthful copy and renders every verification state", () => {
    expect(panel).toContain("Коммерческие курсы проверяются вручную по данным 1С");
    expect(panel).not.toContain("Свежесть");
    for (const label of ["Не проверено", "Соответствует 1С", "Не соответствует 1С", "Проверено вручную, изменений не требуется"]) expect(panel).toContain(label);
  });

  it("shows the comparison and exactly two explicit control actions", () => {
    for (const label of ["Текущий курс портала", "Наблюдаемый курс 1С", "Разница", "Последняя проверка", "Проверил"]) expect(panel).toContain(label);
    expect(panel).toContain("Проверить и сохранить контроль");
    expect(panel).toContain("Опубликовать значение из 1С");
    expect(panel.match(/type="submit"/g)).toHaveLength(2);
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
  });
});
