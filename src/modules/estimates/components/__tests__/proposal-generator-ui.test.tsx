import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve("src/modules/estimates/components/ProposalGeneratorWorkspace.tsx"), "utf8");
const navigation = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-capability.service.ts"), "utf8");

describe("proposal generator UI contract", () => {
  it("exposes the released generator from canonical partner navigation", () => {
    expect(navigation).toContain('label: "Генератор КП"');
    expect(navigation).toContain('href: "/cabinet/estimates/generator"');
    expect(navigation).toContain('requiredPermission: "estimates.manage"');
  });
  it("renders two focused steps and all canonical sections", () => {
    expect(component).toContain("Сформировать черновик");
    expect(component).toContain("Шаг 2 из 2");
    expect(component).toContain("GENERATOR_SECTIONS.map");
    expect(component).toContain("Создать смету");
  });
  it("keeps resolution explicit and offers safe unresolved handling", () => {
    expect(component).toContain("Требуется выбор позиции");
    expect(component).toContain("Расширить поиск");
    expect(component).toContain("Оставить как потребность");
    expect(component).toContain("Создать внешнюю позицию");
    expect(component).toContain("Цена не указана");
  });
  it("uses responsive bounded layouts without a catalog preload", () => {
    expect(component).toContain("overflow-x-clip");
    expect(component).toContain("lg:grid-cols-");
    expect(component).not.toContain("useEffect(");
  });
});
