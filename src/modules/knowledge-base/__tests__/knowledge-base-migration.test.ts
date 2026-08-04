import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260804200000_knowledge_base_mvp.sql",
  ),
  "utf8",
);
describe("knowledge base migration", () => {
  it("creates the bounded governed domain", () => {
    for (const table of [
      "knowledge_articles",
      "knowledge_categories",
      "knowledge_article_categories",
      "knowledge_article_products",
      "knowledge_article_documents",
      "knowledge_article_videos",
      "knowledge_article_related",
      "knowledge_article_versions",
      "knowledge_article_feedback",
      "knowledge_article_views",
      "knowledge_search_events",
      "knowledge_ticket_suggestions",
    ])
      expect(sql).toContain(`create table public.${table}`);
  });
  it("enforces partner and internal permissions", () => {
    expect(sql).toContain(
      "public.has_permission(p_company_id,'knowledge.view')",
    );
    expect(sql).toContain(
      "public.has_internal_permission('knowledge.publish')",
    );
    expect(sql).toContain("revoke all on public.knowledge_categories");
    expect(sql).toContain("enable row level security");
  });
  it("keeps drafts and private articles out of partner reads", () => {
    expect(sql).toContain("status='published' and visibility='all_partners'");
    expect(sql).toContain(
      "public.can_view_knowledge_article(p_company_id,a.id)",
    );
  });
  it("uses structured content and immutable versions", () => {
    expect(sql).toContain("knowledge_content_is_safe");
    expect(sql).toContain("Knowledge history is append-only");
    expect(sql).not.toContain("dangerouslySetInnerHTML");
  });
  it("keeps document authorization canonical", () => {
    expect(sql).toContain(
      "public.can_access_partner_document(d.id,p_company_id,false)",
    );
    expect(sql).not.toContain("http_get");
    expect(sql).not.toContain("Document_");
  });
  it("stores only privacy-safe query hashes", () => {
    expect(sql).toContain("extensions.digest(q,'sha256')");
    expect(sql).not.toMatch(/knowledge_search_events\([^)]*query_text/);
    expect(sql).not.toMatch(/knowledge_ticket_suggestions\([^)]*description/);
  });
  it("bounds aggregates, suggestions, and product content", () => {
    expect(sql).toContain("least(greatest(coalesce(p_limit,10),1),20)");
    expect(sql).toContain("limit least(greatest(p_limit,1),3)");
    expect(sql).toContain("limit 100");
  });
  it("seeds five controlled published article versions", () => {
    expect(sql.match(/\('(?:kak|chto)-/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain("Контролируемый начальный набор");
    expect(sql).toContain("knowledge_article_versions");
  });
});
