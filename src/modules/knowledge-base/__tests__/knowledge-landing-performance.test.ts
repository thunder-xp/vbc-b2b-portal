import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), "utf8");
const migration = read(
  "supabase/migrations/20260804234000_knowledge_landing_performance.sql",
);

describe("knowledge landing performance", () => {
  it("materializes one published partner-visible locale-scoped article set", () => {
    expect(migration).toContain("visible_articles as materialized");
    expect(migration).toContain("article.status = 'published'");
    expect(migration).toContain("article.visibility = 'all_partners'");
    expect(migration).toContain("article.locale = p_locale");
    expect(migration.match(/public\.has_permission/g)).toHaveLength(1);
  });

  it("returns only populated categories and bounded cards", () => {
    expect(migration).toContain("join visible_articles article");
    expect(migration).toContain("limit 4");
    expect(migration).toContain("limit 5");
    expect(migration).not.toContain("content_json");
    expect(migration).not.toContain("knowledge_article_feedback");
    expect(migration).not.toContain("knowledge_article_versions");
  });

  it("keeps the partner landing outside the editor client boundary", () => {
    const landing = read("src/modules/knowledge-base/landing-components.tsx");
    const page = read("app/(partner)/cabinet/knowledge/page.tsx");
    expect(landing).not.toContain('"use client"');
    expect(landing).not.toContain("searchKnowledgeAction");
    expect(page).toContain("knowledge-base/landing-components");
    expect(page).not.toContain('from "@/src/modules/knowledge-base"');
  });

  it("provides a stable route-level loading state", () => {
    const loading = read("app/(partner)/cabinet/knowledge/loading.tsx");
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("min-h-32");
    expect(loading).not.toContain("fixed inset-0");
  });

  it("does not execute search during the initial landing render", () => {
    const page = read("app/(partner)/cabinet/knowledge/page.tsx");
    expect(page).toMatch(/query\s*\?\s*searchKnowledgeAction\(query\)\s*:\s*Promise\.resolve\(null\)/);
  });

  it("records bounded server-side context and RPC stages", () => {
    const actions = read("src/modules/knowledge-base/actions.ts");
    expect(actions).toContain('"knowledge_landing"');
    expect(actions).toContain('"company_context"');
    expect(actions).toContain('"landing_rpc"');
    expect(actions).toContain('emitRequestTotal("knowledge_landing")');
  });
});
