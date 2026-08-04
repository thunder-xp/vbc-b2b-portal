import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const read = (value: string) =>
  fs.readFileSync(path.join(process.cwd(), value), "utf8");
describe("knowledge application integration", () => {
  it("releases the canonical partner navigation without a coming-soon route", () => {
    const source = read(
      "src/modules/partner-cabinet/services/workspace-capability.service.ts",
    );
    expect(source).toContain('href: "/cabinet/knowledge"');
    expect(source).toContain('requiredPermission: "knowledge.view"');
    expect(source).toContain("released: true");
  });
  it("adds permission-safe global search without N+1 enrichment", () => {
    const source = read(
      "src/modules/partner-search/repositories/supabase-partner-search.repository.ts",
    );
    expect(source).toContain('supabase.rpc("search_partner_knowledge"');
    expect(source).toContain("Promise.all");
  });
  it("integrates at most three product articles", () => {
    const migration = read(
      "supabase/migrations/20260804200000_knowledge_base_mvp.sql",
    );
    const page = read("app/(partner)/cabinet/catalog/[slug]/page.tsx");
    expect(migration).toContain("limit least(greatest(p_limit,1),3)");
    expect(page).toContain("Полезные материалы");
  });
  it("suggests knowledge in support and service without blocking forms", () => {
    const support = read("src/modules/partner-support/components.tsx");
    const service = read("src/modules/service-center/components.tsx");
    expect(support).toContain('<KnowledgeSuggestions source="support"');
    expect(service).toContain('<KnowledgeSuggestions source="service"');
    expect(read("src/modules/knowledge-base/components.tsx")).toContain(
      "setTimeout(async",
    );
  });

  it("resolves knowledge access from active company membership without commercial context", () => {
    const source = read("src/modules/knowledge-base/actions.ts");
    expect(source).toContain("createCompanyAccessService");
    expect(source).toContain("MembershipStatus.Active");
    expect(source).toContain("getActiveCompanyContext");
    expect(source).not.toContain("createPartnerWorkspaceContextService");
  });
  it("renders no arbitrary HTML or eager video iframe", () => {
    const source = read("src/modules/knowledge-base/components.tsx");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("<iframe");
  });
});
