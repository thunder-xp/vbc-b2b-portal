import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const editor = readFileSync(resolve("src/modules/estimates/components/EstimateCommercialEditor.tsx"), "utf8");
const page = readFileSync(resolve("app/(partner)/cabinet/estimates/[estimateId]/page.tsx"), "utf8");
const listPage = readFileSync(resolve("app/(partner)/cabinet/estimates/page.tsx"), "utf8");
const createForm = readFileSync(resolve("src/modules/estimates/components/EstimateCreateForm.tsx"), "utf8");
const workflow = readFileSync(resolve("src/modules/estimates/components/EstimateWorkflowPanel.tsx"), "utf8");
const proposalSidebar = readFileSync(resolve("src/modules/estimates/components/EstimateProposalSidebar.tsx"), "utf8");

describe("estimate workspace architecture", () => {
  it("keeps existing reads parallel and introduces no browser data provider", () => {
    expect(page).toContain("await Promise.all");
    expect(page).toContain("getEstimateAction(estimateId)");
    expect(editor).not.toMatch(/createClient|supabase|fetch\(|1C|ОData/);
  });

  it("uses a bounded responsive canvas instead of the overflowing fixed line grid", () => {
    expect(editor).toContain("xl:grid-cols-[1.25rem_1.5rem_3.5rem_minmax(9rem,1fr)_4.25rem_4.5rem_5.5rem_4.75rem_6rem_5.75rem]");
    expect(editor).toContain("xl:grid-cols-[minmax(0,1fr)_20rem]");
    expect(editor).not.toContain("lg:grid-cols-12 lg:items-end");
    expect(editor).not.toContain("md:grid-cols-[1.5rem_2.5rem_minmax(12rem,1fr)");
  });

  it("keeps lifecycle workflow while removing partner-facing version management", () => {
    expect(page).toContain("EstimateWorkflowPanel");
    expect(page).not.toContain('id="proposal-versions"');
    expect(editor).not.toContain("Версия {estimate.revision}");
    for (const source of [listPage, workflow, proposalSidebar]) {
      expect(source).not.toMatch(/Версии предложения|Создать новую версию|Комментарий к версии|Зафиксированная версия|Все версии|Статус версии|Версии и отправка/);
    }
    expect(listPage).not.toContain("versionStatus");
  });

  it("uses one balanced creation grid without changing the post-create VAT rule", () => {
    expect(createForm).toContain('className="grid gap-x-5 gap-y-4 sm:grid-cols-2"');
    expect(createForm).toContain('className="sm:col-span-2"><Field label="Название сметы"');
    expect(createForm).toContain("Настраивается в рабочей смете");
    expect(createForm).not.toMatch(/disabled[^>]*name="vat/i);
  });
});
