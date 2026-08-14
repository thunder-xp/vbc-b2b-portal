import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve("src/modules/estimates/components/AdminCctvCameraPools.tsx"), "utf8");

describe("admin CCTV services workspace", () => {
  it("uses one stable seven-column desktop grid", () => {
    for (const heading of ["Услуга", "Класс", "Ед.", "Общий тариф", "Активна", "По умолчанию", "Действие"]) {
      expect(component.match(new RegExp(`role=\\"columnheader\\">${heading.replace(".", "\\.")}`, "g"))).toHaveLength(1);
    }
    expect(component).toContain("xl:grid-cols-[minmax(220px,1.8fr)_4rem_4.5rem_9.5rem_5.5rem_6.5rem_7.5rem]");
    expect(component).toContain("classLabel(row.complexityClass)");
  });

  it("keeps family headings outside the row geometry and separates class from service", () => {
    for (const family of ["Прокладка кабеля", "Монтаж оборудования", "Пусконаладка", "Программирование AI-сценариев"]) {
      expect(component).toContain(family);
    }
    expect(component).toContain("familyLabels[row.family]");
    expect(component).not.toContain("<strong>{row.label}</strong>");
  });

  it("provides controlled tariff editing and guards enabled/default states", () => {
    expect(component).toContain('inputMode="decimal"');
    expect(component).toContain('step="0.01"');
    expect(component).toContain('placeholder="Не задан"');
    expect(component).toContain("const canEnable=canManage&&priceValid");
    expect(component).toContain('normalizedPrice!==""&&!priceValid');
    expect(component).toContain("Сначала укажите тариф.");
    expect(component).toContain('disabled={!canManage}');
    expect(component).toContain('disabled={!canEnable}');
    expect(component).toContain('disabled={!canManage||!enabled}');
    expect(component).toContain("if(!event.target.checked)setSuggested(false)");
    expect(component).toContain("saveCctvServiceConfigurationAction");
    expect(component).not.toContain("B2B-позиция услуги не связана");
  });

  it("renders labeled cards below desktop without a seven-column minimum width", () => {
    expect(component).toContain('className="text-xs text-zinc-500 xl:hidden"');
    expect(component).toContain("min-h-11");
    expect(component).not.toContain('min-w-[780px]');
    expect(component).not.toContain("upsertCctvObjectServiceBindingAction");
  });
});
