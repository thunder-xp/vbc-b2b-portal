import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve("app/(partner)/cabinet/finance/page.tsx"),
  "utf8",
);

describe("Finance page streaming contract", () => {
  it("starts the bounded document read without gating the finance overview", () => {
    expect(source).toContain(
      'listPartnerDocumentsAction({ section: "accounting", pageSize: 6 })',
    );
    expect(source).toMatch(
      /const \[result, locale\] = await Promise\.all\(\[\s*getFinanceOverviewAction\(\),\s*getPartnerLocale\(\),\s*\]\)/,
    );
  });

  it("renders documents behind a stable local Suspense boundary", () => {
    expect(source).toContain(
      "<Suspense fallback={<FinanceDocumentsLoading locale={locale} />}>",
    );
    expect(source).toContain('className="min-h-40 border-t border-zinc-200 pt-6"');
    expect(source).toContain('aria-busy="true"');
  });

  it("isolates a document failure from the finance overview", () => {
    expect(source).toContain("if (!documentsResult.success)");
    expect(source.indexOf("<FinanceOverview")).toBeLessThan(
      source.indexOf("<Suspense"),
    );
    expect(source).toContain("Финансовые документы временно недоступны");
  });
});
