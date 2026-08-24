import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260824165422_public_blog_governance.sql", "utf8");

describe("public Blog governance migration", () => {
  it("keeps public Blog separate from tenant Knowledge and uses explicit localized lifecycle rows", () => {
    expect(sql).toContain("create table public.public_blog_articles");
    expect(sql).toContain("create table public.public_blog_localizations");
    expect(sql).toContain("locale in ('ru', 'ro')");
    expect(sql).toContain("status in ('draft', 'review', 'published', 'archived')");
    expect(sql).not.toContain("alter table public.knowledge_articles");
  });

  it("exposes only bounded published projections to anonymous callers", () => {
    expect(sql).toContain("p_limit not between 1 and 24");
    expect(sql).toContain("localization.status = 'published'");
    expect(sql).toContain("grant execute on function public.list_public_blog_articles");
    expect(sql).not.toMatch(/grant\s+select[^;]+public_blog_articles[^;]+anon/i);
  });

  it("enforces internal permission, optimistic conflict, RLS, and append-only audit", () => {
    expect(sql).toContain("public.has_internal_permission('admin.catalog.manage')");
    expect(sql).toContain("using errcode = 'PT409'");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("Public Blog events are append-only.");
    expect(sql).toContain("set search_path = ''");
  });

  it("uses stable catalog identities and reverse indexes without name matching", () => {
    expect(sql).toContain("references public.public_retail_product_identities(public_id)");
    expect(sql).toContain("references public.public_retail_category_identities(public_id)");
    expect(sql).toContain("public_blog_relations_product_reverse_idx");
    expect(sql).not.toMatch(/where\s+product\.name\s*=/i);
  });

  it("separates private source media from the published public WebP projection", () => {
    expect(sql).toContain("('public-blog-source', 'public-blog-source', false");
    expect(sql).toContain("('public-blog-media', 'public-blog-media', true");
    expect(sql).toContain("array['image/webp']");
  });
});
