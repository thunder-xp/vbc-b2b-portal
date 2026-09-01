import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/modules/pricing-inventory/components/CommercialRateAdminPanel.tsx"), "utf8");
const action = readFileSync(resolve(process.cwd(), "src/modules/pricing-inventory/actions/commercial-rate.actions.ts"), "utf8");

describe("commercial-rate admin clarity", () => {
  it("describes governed manual confirmation without future-sync or freshness claims", () => {
    expect(panel).toContain("Коммерческие курсы подтверждаются вручную по данным 1С");
    expect(panel).toContain("Текущий стандартный OData 1С не предоставляет конечный BCRU/RTL курс");
    expect(panel).not.toContain("Автоматическая синхронизация станет доступна");
    expect(panel).not.toContain("Свежесть");
    expect(panel).not.toContain("Ожидание API");
  });

  it("prioritizes current value, effective date, publication time, source, and status", () => {
    for (const label of ["Текущий курс", "Дата действия", "Опубликовано", "Источник", "Активен"]) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain("Подтверждающие сведения");
    expect(panel).toContain("История подтверждений");
    expect(panel).toContain('timeZone: "Europe/Chisinau"');
  });

  it("distinguishes semantic replay from a new immutable publication without another read", () => {
    const publishAction = action.slice(action.indexOf("export async function publishCommercialRateAction"));
    expect(panel).toContain('name="currentRateId"');
    expect(publishAction).toContain('rate.id === text(formData, "currentRateId")');
    expect(publishAction).toContain("Курс уже актуален. Новая версия не создана.");
    expect(publishAction).toContain("Новый курс опубликован.");
    expect(publishAction).not.toContain("getAdminView");
  });
});
