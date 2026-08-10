import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(resolve("src/modules/estimates/components/ProposalGeneratorWorkspace.tsx"), "utf8");
const calculator = readFileSync(resolve("src/modules/estimates/components/ProposalQuickCalculator.tsx"), "utf8");
const review = readFileSync(resolve("src/modules/estimates/components/ProposalGeneratorReview.tsx"), "utf8");
const navigation = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-capability.service.ts"), "utf8");
const adminProfiles = readFileSync(resolve("src/modules/estimates/components/AdminProposalGeneratorProfiles.tsx"), "utf8");

describe("proposal generator UI contract", () => {
  it("keeps one canonical navigation entry", () => {
    expect(navigation).toContain('label: "Генератор КП"');
    expect(navigation).toContain('href: "/cabinet/estimates/generator"');
    expect(navigation).not.toContain("Быстрый расчёт");
  });
  it("offers two modes and remembers the selection in session storage", () => {
    expect(workspace).toContain("Быстрый расчёт"); expect(workspace).toContain("По описанию");
    expect(workspace).toContain("novotech-proposal-generator-mode");
    expect(workspace).toContain('dynamic(() => import("./ProposalQuickCalculator")');
  });
  it("uses three calculator steps and minimal CCTV controls", () => {
    expect(calculator).toContain("Шаг {step} из 3"); expect(workspace).toContain("Шаг 3 из 3");
    for (const label of ["Камеры внутри", "Камеры снаружи", "Архив, дней", "Кабель, ориентировочно, м", "Дополнительные параметры"]) expect(calculator).toContain(label);
  });
  it("converges both modes into one review and delays customer context", () => {
    expect(workspace).toContain("ProposalGeneratorReview"); expect(workspace).toContain("createPanelOpen");
    expect(workspace.indexOf("FinalCustomerPicker")).toBeLessThan(workspace.indexOf("function ProposalGeneratorWorkspace"));
    expect(review).toContain("GENERATOR_SECTIONS.map"); expect(review).toContain("Оставить как потребность");
  });
  it("keeps responsive bounded layouts and explicit unresolved states", () => {
    expect(workspace).toContain("overflow-x-clip"); expect(review).toContain("lg:grid-cols-");
    expect(calculator).toContain("sm:grid-cols-2"); expect(review).toContain("Цена не указана");
  });
  it("shows known-position totals, unpriced-work disclosure, and governed service price controls", () => {
    expect(workspace).toContain("Ориентировочная стоимость известных позиций");
    expect(workspace).toContain("требуется указать цену");
    expect(adminProfiles).toContain("Цена услуги для быстрого расчёта");
    expect(adminProfiles).toContain("НДС включён");
    expect(adminProfiles).toContain("updateProposalGeneratorServicePriceAction");
  });
  it("prefers the governed MDL calculator currency when it is available", () => {
    expect(workspace).toContain('currencies.includes("MDL") ? "MDL" : currencies[0] ?? "USD"');
  });
  it("captures the estimate VAT choice before generator hand-off", () => {
    expect(workspace).toContain('useState<"none" | "included">("none")');
    expect(workspace).toContain('label="НДС"');
    expect(workspace).toContain('value="included">НДС применяется (20%)');
    expect(workspace).toContain("currencyCode, vatMode, validityDays");
  });
});
